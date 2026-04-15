import { supabase } from '../_lib/supabase.js';
import { stripe } from '../_lib/stripe.js';

export const config = {
  api: { bodyParser: false }, // Raw body needed for Stripe signature verification
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL = 'support@weir.co.jp';

async function sendAlertEmail(subject, htmlBody) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping alert email');
    return;
  }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Weir Alert <noreply@weir.co.jp>',
        to: [ALERT_EMAIL],
        subject,
        html: htmlBody,
      }),
    });
  } catch (e) {
    console.error('Alert email failed:', e.message);
  }
}

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed: ' + err.message });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await supabase
            .from('orders')
            .update({ payment_status: 'captured' })
            .eq('id', orderId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;

        // metadata にorder_idがある場合
        if (orderId) {
          await supabase
            .from('orders')
            .update({ payment_status: 'failed', status: 'cancelled' })
            .eq('id', orderId);
        }

        // payment_intent_id で検索（create-payment-intent で作成されたorphan order対応）
        if (!orderId && pi.id) {
          const { data: orphanOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('payment_intent_id', pi.id)
            .eq('payment_status', 'pending')
            .maybeSingle();

          if (orphanOrder) {
            await supabase
              .from('orders')
              .update({ payment_status: 'failed', status: 'cancelled' })
              .eq('id', orphanOrder.id);
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const pi = charge.payment_intent;
        if (pi) {
          const { data: order } = await supabase
            .from('orders')
            .select('id')
            .eq('payment_intent_id', pi)
            .single();

          if (order) {
            await supabase
              .from('orders')
              .update({ payment_status: 'refunded' })
              .eq('id', order.id);
          }
        }
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const chargeId = dispute.charge;
        const piId = dispute.payment_intent;
        const amount = dispute.amount;
        const reason = dispute.reason;

        // audit_logs に記録
        await supabase.from('audit_logs').insert({
          action: 'chargeback_dispute_created',
          details: {
            dispute_id: dispute.id,
            charge_id: chargeId,
            payment_intent_id: piId,
            amount,
            reason,
            currency: dispute.currency,
          },
        });

        // 該当注文のステータスを 'disputed' に更新
        if (piId) {
          const { data: order } = await supabase
            .from('orders')
            .select('id, display_id, venue_id')
            .eq('payment_intent_id', piId)
            .single();

          if (order) {
            await supabase
              .from('orders')
              .update({ payment_status: 'disputed' })
              .eq('id', order.id);

            await sendAlertEmail(
              '【Weir 緊急】チャージバック発生',
              `<h2>チャージバック発生通知</h2>
               <p><strong>Dispute ID:</strong> ${dispute.id}</p>
               <p><strong>注文ID:</strong> ${order.display_id || order.id}</p>
               <p><strong>金額:</strong> ¥${amount?.toLocaleString()}</p>
               <p><strong>理由:</strong> ${reason}</p>
               <p><strong>PaymentIntent:</strong> ${piId}</p>
               <p>Stripeダッシュボードで確認してください。</p>`
            );
          }
        }
        break;
      }

      case 'radar.early_fraud_warning.created': {
        const warning = event.data.object;
        const chargeId = warning.charge;
        const piId = warning.payment_intent;
        const fraudType = warning.fraud_type;

        // audit_logs に記録
        await supabase.from('audit_logs').insert({
          action: 'radar_fraud_warning',
          details: {
            warning_id: warning.id,
            charge_id: chargeId,
            payment_intent_id: piId,
            fraud_type: fraudType,
            actionable: warning.actionable,
          },
        });

        // メール通知
        await sendAlertEmail(
          '【Weir 警告】不正利用の疑い検知',
          `<h2>Radar 不正利用警告</h2>
           <p><strong>Warning ID:</strong> ${warning.id}</p>
           <p><strong>Charge ID:</strong> ${chargeId}</p>
           <p><strong>PaymentIntent:</strong> ${piId || 'N/A'}</p>
           <p><strong>不正タイプ:</strong> ${fraudType}</p>
           <p><strong>対応可能:</strong> ${warning.actionable ? 'はい' : 'いいえ'}</p>
           <p>Stripeダッシュボードで確認してください。</p>`
        );
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook processing failed: ' + e.message });
  }
}
