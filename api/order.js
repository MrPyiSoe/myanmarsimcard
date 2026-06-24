 export default async function handler(req, res) {

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  

  const body = req.body;

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  const GITHUB_REPO = process.env.GITHUB_REPO;


  if (body.callback_query) {

    const { data: action, message } = body.callback_query;

    const { id: chatId } = message.chat;

    const messageId = message.message_id;

    const text = message.text;


    if (action === 'confirm') {

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text + "\n\n✅ အော်ဒါအတည်ပြုပြီးပါပြီ။" } )

      });

      return res.status(200).send('OK');

    }


    if (action === 'cancel') {

      const lines = text.split('\n');

      const cancelledItems = [];


      // 🌟 ပိုက်ဆံအိတ် (💰) သင်္ကေတဖြင့် နံပါတ်နှင့် ဈေးနှုန်းကို အတိအကျ ခွဲထုတ်ခြင်း 🌟

      for (const line of lines) {

        const cleanLine = line.trim();

        if (cleanLine.startsWith('- 09')) {

          // "- 09 7500 414 89 (B2B) 💰 15,000 Ks" ကို ' 💰 ' ဖြင့် နှစ်ပိုင်းခွဲမည်

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

            } );

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

        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text + "\n\n❌ အော်ဒါပယ်ဖျက်လိုက်ပါပြီ။ (နံပါတ်များ ပြန်ထည့်ပြီးပါပြီ )" })

      });

      return res.status(200).send('OK');

    }

  }


  const { name, phone, address, cart, total } = body;

  if (name && cart) {

    let orderText = `🛒 <b>အော်ဒါအသစ် ရောက်ပါပြီ!</b>\n\n👤 အမည်: ${name}\n📞 ဖုန်း: ${phone}\n📍 လိပ်စာ: ${address}\n\n🛍️ <b>မှာယူသော နံပါတ်များ:</b>\n`;

    

    // 🌟 Telegram သို့ ပို့ရာတွင် ပိုက်ဆံအိတ် (💰) သင်္ကေတ ခံ၍ ပို့မည် 🌟

    cart.forEach(item => { orderText += `- ${item.number} 💰 ${item.price}\n`; });

    

    orderText += `\n💵 <b>စုစုပေါင်း: ${total}</b>`;


    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        chat_id: CHAT_ID, text: orderText, parse_mode: 'HTML',

        reply_markup: { inline_keyboard: [[ { text: "✅ Order Confirm", callback_data: "confirm" }, { text: "❌ Order Cancelled", callback_data: "cancel" } ]] }

      } )

    });


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

        } );

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


    return res.status(200).json({ success: true });

  }

  return res.status(400).json({ error: 'Invalid request' });

} 
