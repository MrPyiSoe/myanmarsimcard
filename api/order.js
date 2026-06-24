import { createClient } from '@supabase/supabase-js';

// Supabase Client ကို ထည့်သွင်းချိတ်ဆက်ခြင်း
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const body = req.body;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;

  // ==========================================
  // ⚡ Telegram ခလုတ်များ (Confirm/Cancel) နှိပ်ခြင်းကို ကိုင်တွယ်ခြင်း
  // ==========================================
  if (body.callback_query) {
    const { data: actionData, message } = body.callback_query;
    const { id: chatId } = message.chat;
    const messageId = message.message_id;
    const text = message.text;

    // ခလုတ်ဒေတာမှ Action နှင့် Order ID ကို ခွဲထုတ်ခြင်း (ဥပမာ - "confirm_15")
    const [action, orderId] = actionData.split('_');

    // ✅ အော်ဒါအတည်ပြုခြင်း
    if (action === 'confirm') {
      if (orderId) {
        try {
          await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId);
        } catch (dbErr) {
          console.error("Supabase Confirm Error:", dbErr);
        }
      }

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          message_id: messageId, 
          text: text + `\n\n✅ အော်ဒါအတည်ပြုပြီးပါပြီ။ (Order ID: #${orderId || '-'} ကို Supabase တွင် Status ပြောင်းလဲပြီး)` 
        })
      });
      return res.status(200).send('OK');
    }

    // ❌ အော်ဒါပယ်ဖျက်ခြင်း
    if (action === 'cancel') {
      if (orderId) {
        try {
          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
        } catch (dbErr) {
          console.error("Supabase Cancel Error:", dbErr);
        }
      }

      const lines = text.split('\n');
      const cancelledItems = [];

      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('- 09')) {
          const parts = cleanLine.substring(2).split(' 💰 ');
          if (parts.length === 2) {
            cancelledItems.push({ number: parts[0].trim(), price: parts[1].trim() });
          }
        }
      }

      if (cancelledItems.length > 0) {
        const fileUpdates = { 'ooredoo.json': [], 'atom.json': [], 'mytel.json': [], 'mpt.json': [] };
        for (const item of cancelledItems) {
          const cleanNum = item.number.replace(/\s/g, '');
          if (cleanNum.startsWith('099')) fileUpdates['ooredoo.json'].push(item);
          else if (cleanNum.startsWith('097')) fileUpdates['atom.json'].push(item);
          else if (cleanNum.startsWith('096')) fileUpdates['mytel.json'].push(item);
          else fileUpdates['mpt.json'].push(item);
        }

        await Promise.all(Object.entries(fileUpdates).map(async ([file, itemsToAdd]) => {
          if (itemsToAdd.length === 0) return;
          try {
            const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
              headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (getRes.ok) {
              const fileData = await getRes.json();
              const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
              let jsonContent = JSON.parse(content).concat(itemsToAdd);
              await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
                method: 'PUT',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
                body: JSON.stringify({
                  message: `Restore items to ${file}`,
                  content: Buffer.from(JSON.stringify(jsonContent, null, 2 )).toString('base64'),
                  sha: fileData.sha
                })
              });
            }
          } catch (e) { console.error(e); }
        }));
      }

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId, 
          message_id: messageId, 
          text: text + `\n\n❌ အော်ဒါပယ်ဖျက်လိုက်ပါပြီ။ (Order ID: #${orderId || '-'} ကို ဖျက်သိမ်းပြီး နံပါတ်များ ပြန်ထည့်ပြီးပါပြီ)` 
        })
      });
      return res.status(200).send('OK');
    }
  }

  // ==========================================
  // 🛒 ဝဘ်ဆိုဒ်မှ အော်ဒါအသစ် စတင်ဝင်ရောက်လာခြင်း
  // ==========================================
  const { name, phone, address, cart, total, userEmail } = body;
  
  if (name && cart) {
    let insertedOrderId = null;
    const itemsText = cart.map(item => `${item.number} (${item.price})`).join(', ');

    // ၁။ Supabase Database ထဲသို့ အော်ဒါကို အရင်ဦးဆုံး သိမ်းဆည်းပြီး ID ယူခြင်း
    try {
      const { data: dbData, error: dbError } = await supabase
        .from('orders')
        .insert([
          { 
            customer_name: name, 
            customer_phone: phone,
            customer_address: address, 
            total_price: total,
            cart_items: itemsText,   
            user_email: userEmail || 'guest',   
            status: 'pending'
          }
        ])
        .select('id') // 👈 သိမ်းပြီးရင် ID ကို ချက်ချင်း ပြန်တောင်းလိုက်တာပါ
        .single();

      if (!dbError && dbData) {
        insertedOrderId = dbData.id; // ရလာတဲ့ ID ကို ကိန်းရှင်ထဲ ထည့်လိုက်ပြီ
      } else {
        console.error("Supabase Save Error:", dbError);
      }
    } catch (dbEx) {
      console.error("Supabase Exception:", dbEx);
    }

    // ၂။ Telegram Message စာသား ပြင်ဆင်ခြင်း
    let orderText = `🛒 <b>အော်ဒါအသစ် ရောက်ပါပြီ!</b>\n\n`;
    if (insertedOrderId) {
      orderText += `<b>🆔 Order ID: #${insertedOrderId}</b>\n\n`; // Telegram ထဲမှာပါ အော်ဒါ ID ပြပေးမယ်
    }
    orderText += `👤 အမည်: ${name}\n📞 ဖုန်း: ${phone}\n📍 လိပ်စာ: ${address}\n\n🛍️ <b>မှာယူသော နံပါတ်များ:</b>\n`;
    
    cart.forEach(item => { orderText += `- ${item.number} 💰 ${item.price}\n`; });
    orderText += `\n💵 <b>စုစုပေါင်း: ${total}</b>`;

    // ၃။ Telegram Bot ထံသို့ Inline Keyboard ခလုတ်များတွင် Order ID ပါတွဲ၍ ပို့ဆောင်ခြင်း
    // callback_data ထဲမှာ "confirm_15" သို့မဟုတ် "cancel_15" ပုံစံမျိုး ဝင်သွားမှာပါ
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID, text: orderText, parse_mode: 'HTML',
        reply_markup: { 
          inline_keyboard: [[ 
            { text: "✅ Order Confirm", callback_data: `confirm_${insertedOrderId || ''}` }, 
            { text: "❌ Order Cancelled", callback_data: `cancel_${insertedOrderId || ''}` } 
          ]] 
        }
      })
    });

    // ၄။ GitHub JSON ဖိုင်များထဲမှ နံပါတ်များ ဖယ်ထုတ်ခြင်း (အစ်ကို့ မူရင်းကုဒ်အတိုင်း)
    const fileUpdates = { 'ooredoo.json': [], 'atom.json': [], 'mytel.json': [], 'mpt.json': [] };
    for (const item of cart) {
      const cleanNum = item.number.replace(/\s/g, '');
      if (cleanNum.startsWith('099')) fileUpdates['ooredoo.json'].push(item.number);
      else if (cleanNum.startsWith('097')) fileUpdates['atom.json'].push(item.number);
      else if (cleanNum.startsWith('096')) fileUpdates['mytel.json'].push(item.number);
      else fileUpdates['mpt.json'].push(item.number);
    }

    await Promise.all(Object.entries(fileUpdates).map(async ([file, numbersToRemove]) => {
      if (numbersToRemove.length === 0) return;
      try {
        const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
          headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (getRes.ok) {
          const fileData = await getRes.json();
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          let jsonContent = JSON.parse(content).filter(item => !numbersToRemove.includes(item.number));
          await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            body: JSON.stringify({
              message: `Remove items from ${file}`,
              content: Buffer.from(JSON.stringify(jsonContent, null, 2 )).toString('base64'),
              sha: fileData.sha
            })
          });
        }
      } catch (e) { console.error(e); }
    }));

    return res.status(200).json({ success: true, orderId: insertedOrderId });
  }
  return res.status(400).json({ error: 'Invalid request' });
}
