#!/usr/bin/env node

/**
 * RAG Embedding Generator
 *
 * docs/merchant-faq-v1.0.md と docs/merchant-manual-v1.0.md を
 * チャンク分割し、OpenAI text-embedding-3-small でエンベディングを生成、
 * faq_embeddings テーブルに保存する。
 *
 * Usage: node scripts/generate-embeddings.js
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

/**
 * FAQ markdown をQ&Aペア単位でチャンク分割
 */
function chunkFaq(content) {
  const chunks = [];
  const lines = content.split('\n');
  let currentChunk = '';
  let currentHeading = '';

  for (const line of lines) {
    // New Q&A starts with ### Q
    if (line.startsWith('### Q')) {
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          heading: currentHeading,
        });
      }
      currentChunk = line + '\n';
      currentHeading = line.replace(/^###\s*/, '');
    } else if (line.startsWith('## ') && currentChunk.trim()) {
      // Section header - save current chunk and start fresh
      chunks.push({
        text: currentChunk.trim(),
        heading: currentHeading,
      });
      currentChunk = '';
      currentHeading = line.replace(/^##\s*/, '');
    } else {
      currentChunk += line + '\n';
    }
  }

  // Save last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      heading: currentHeading,
    });
  }

  return chunks.filter(c => c.text.length > 50); // Skip very short chunks
}

/**
 * Manual markdown をセクション単位（~500文字）でチャンク分割
 */
function chunkManual(content) {
  const chunks = [];
  const sections = content.split(/\n(?=## )/);

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0]?.replace(/^#+\s*/, '') || '';

    // If section is short enough, keep as one chunk
    if (section.length <= 800) {
      if (section.trim().length > 50) {
        chunks.push({ text: section.trim(), heading });
      }
      continue;
    }

    // Split by sub-sections (###)
    const subSections = section.split(/\n(?=### )/);
    for (const sub of subSections) {
      if (sub.trim().length > 50) {
        const subHeading = sub.split('\n')[0]?.replace(/^#+\s*/, '') || heading;
        chunks.push({ text: sub.trim(), heading: subHeading });
      }
    }
  }

  return chunks;
}

/**
 * Generate embeddings for chunks in batches
 */
async function generateEmbeddings(chunks) {
  const BATCH_SIZE = 20;
  const results = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    console.log(`  Generating embeddings ${i + 1}-${Math.min(i + BATCH_SIZE, chunks.length)} of ${chunks.length}...`);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: response.data[j].embedding,
      });
    }

    // Rate limit safety
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

async function main() {
  console.log('=== AIden RAG Embedding Generator ===\n');

  // 1. Read source files
  const faqPath = resolve(PROJECT_ROOT, 'docs/merchant-faq-v1.0.md');
  const manualPath = resolve(PROJECT_ROOT, 'docs/merchant-manual-v1.0.md');

  console.log('Reading FAQ...');
  const faqContent = readFileSync(faqPath, 'utf-8');
  const faqChunks = chunkFaq(faqContent);
  console.log(`  ${faqChunks.length} chunks extracted from FAQ`);

  console.log('Reading Manual...');
  const manualContent = readFileSync(manualPath, 'utf-8');
  const manualChunks = chunkManual(manualContent);
  console.log(`  ${manualChunks.length} chunks extracted from Manual`);

  // 2. Clear existing embeddings
  console.log('\nClearing existing embeddings...');
  const { error: delErr } = await supabase
    .from('faq_embeddings')
    .delete()
    .in('source', ['faq', 'manual']);

  if (delErr) {
    console.error('Error clearing embeddings:', delErr);
    process.exit(1);
  }

  // 3. Generate and insert FAQ embeddings
  console.log('\nGenerating FAQ embeddings...');
  const faqEmbeddings = await generateEmbeddings(faqChunks);

  for (let i = 0; i < faqEmbeddings.length; i++) {
    const e = faqEmbeddings[i];
    const { error: insertErr } = await supabase
      .from('faq_embeddings')
      .insert({
        source: 'faq',
        chunk_text: e.text,
        embedding: e.embedding,
        metadata: { heading: e.heading, chunk_index: i },
      });

    if (insertErr) {
      console.error(`Error inserting FAQ chunk ${i}:`, insertErr);
    }
  }
  console.log(`  ${faqEmbeddings.length} FAQ embeddings saved`);

  // 4. Generate and insert Manual embeddings
  console.log('\nGenerating Manual embeddings...');
  const manualEmbeddings = await generateEmbeddings(manualChunks);

  for (let i = 0; i < manualEmbeddings.length; i++) {
    const e = manualEmbeddings[i];
    const { error: insertErr } = await supabase
      .from('faq_embeddings')
      .insert({
        source: 'manual',
        chunk_text: e.text,
        embedding: e.embedding,
        metadata: { heading: e.heading, chunk_index: i },
      });

    if (insertErr) {
      console.error(`Error inserting Manual chunk ${i}:`, insertErr);
    }
  }
  console.log(`  ${manualEmbeddings.length} Manual embeddings saved`);

  // 5. Verify
  const { count } = await supabase
    .from('faq_embeddings')
    .select('*', { count: 'exact', head: true });

  console.log(`\n=== Complete! Total embeddings in DB: ${count} ===`);
  console.log('Note: Run the following SQL to create the IVFFlat index after data insertion:');
  console.log('CREATE INDEX IF NOT EXISTS idx_faq_embeddings_vector ON faq_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
