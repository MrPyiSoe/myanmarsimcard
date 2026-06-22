export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    // ==========================================
    // ၁။ Telegram မှ Confirm / Cancel နှိပ်ခြင်းကို လက်ခံမည့်အပိုင်း
    // ==========================================
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const action = callbackQuery.data;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const text = callbackQuery.message.text;

      // ✅ Order Confirm ကို နှိပ်ခဲ့လျှင်
      if (action === 'confirm') {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text + "\n\n✅ အော်ဒါအတည်ပြုပြီးပါပြီ။ (နံပါတ်များကို ဝဘ်ဆိုက်မှ အပြီးတိုင် ဖျက်လိုက်ပါပြီ )"
          })
        });
        return res.status(200).send('OK');
      }

      // ❌ Order Cancelled ကို နှိပ်ခဲ့လျှင်
      if (action === 'cancel') {
        const lines = text.split('\n');
        const cancelledItems = [];

        // Telegram စာသားထဲမှ ဖုန်းနံပါတ်နှင့် ဈေးနှုန်းကို ပြန်ရှာခြင်း (B2B ပါလည်း မမှားတော့မည့် နည်းလမ်းအသစ်)
        for (const line of lines) {
          const lineStr = line.trim();
          if (lineStr.startsWith('- 09')) {
            // နောက်ဆုံးပိတ်ထားသော ( ) ကိုသာ ဈေးနှုန်းအဖြစ် ယူမည်
            const lastParenOpen = lineStr.lastIndexOf(' (');
            const lastParenClose = lineStr.lastIndexOf(')');
            
            if (lastParenOpen !== -1 && lastParenClose > lastParenOpen) {
              const numberPart = lineStr.substring(2, lastParenOpen).trim();
              const pricePart = lineStr.substring(lastParenOpen + 2, lastParenClose).trim();
              cancelledItems.push({ number: numberPart, price: pricePart });
            }
          }
        }

        if (cancelledItems.length > 0) {
          const fileUpdates = { 'ooredoo.json': [], 'atom.json': [], 'mytel.json': [], 'mpt.json': [] };

          // ရှေ့ဆုံးဂဏန်းများကို ကြည့်၍ သက်ဆိုင်ရာ Operator ဖိုင်ခွဲခြားခြင်း
          for (const item of cancelledItems) {
            const cleanNum = item.number.replace(/\s/g, '');
            if (cleanNum.startsWith('099')) fileUpdates['ooredoo.json'].push(item);
            else if (cleanNum.startsWith('097')) fileUpdates['atom.json'].push(item);
            else if (cleanNum.startsWith('096')) fileUpdates['mytel.json'].push(item);
            else fileUpdates['mpt.json'].push(item);
          }

          // သက်ဆိုင်ရာ JSON ဖိုင်များထဲသို့ ပြန်လည်ပေါင်းထည့်ခြင်း
          await Promise.all(Object.entries(fileUpdates).map(async ([file, itemsToAdd]) => {
            if (itemsToAdd.length === 0) return;
            try {
              const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
                headers: {
                  'Authorization': `token ${GITHUB_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json'
                }
              } );
              if (getRes.ok) {
                const fileData = await getRes.json();
                const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                let jsonContent = JSON.parse(content);
                
                // ဖျက်ထားသော နံပါတ်များကို ပြန်ထည့်ခြင်း
                jsonContent = jsonContent.concat(itemsToAdd);

                // GitHub သို့ ပြန်လည်သိမ်းဆည်းခြင်း
                await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                  },
                  body: JSON.stringify({
                    message: `Restore cancelled items to ${file}`,
                    content: Buffer.from(JSON.stringify(jsonContent, null, 2 )).toString('base64'),
                    sha: fileData.sha
                  })
                });
              }
            } catch (e) {
              console.error(e);
            }
          }));
        }

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text + "\n\n❌ အော်ဒါပယ်ဖျက်လိုက်ပါပြီ။ (နံပါတ်များကို ဝဘ်ဆိုက်သို့ ပြန်ထည့်ပေးလိုက်ပါပြီ )"
          })
        });
        return res.status(200).send('OK');
      }
    }

    // ==========================================
    // ၂။ ဝဘ်ဆိုက်မှ အော်ဒါအသစ် တင်ခြင်းကို လက်ခံမည့်အပိုင်း
    // ==========================================
    const { name, phone, address, cart, total } = body;
    
    if (name && cart) {
      let orderText = `🛒 <b>အော်ဒါအသစ် ရောက်ပါပြီ!</b>\n\n`;
      orderText += `👤 အမည်: ${name}\n`;
      orderText += `📞 ဖုန်း: ${phone}\n`;
      orderText += `📍 လိပ်စာ: ${address}\n\n`;
      orderText += `🛍️ <b>မှာယူသော နံပါတ်များ:</b>\n`;
      
      cart.forEach(item => {
        orderText += `- ${item.number} (${item.price})\n`;
      });
      
      orderText += `\n💰 <b>စုစုပေါင်း: ${total}</b>`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Order Confirm", callback_data: "confirm" },
            { text: "❌ Order Cancelled", callback_data: "cancel" }
          ]
        ]
      };

      // Telegram သို့ ပို့ခြင်း
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: orderText,
          parse_mode: 'HTML',
          reply_markup: keyboard
        } )
      });

           // ==========================================
      // ၃။ အော်ဒါတင်လိုက်သော နံပါတ်များကို JSON မှ ယာယီဖျက်ခြင်း
      // ==========================================
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
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          } );
          if (getRes.ok) {
            const fileData = await getRes.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            let jsonContent = JSON.parse(content);
            
            // မှာယူသွားသော နံပါတ်များကို ဖယ်ထုတ်ခြင်း
            jsonContent = jsonContent.filter(item => !numbersToRemove.includes(item.number));

            // GitHub သို့ ပြန်လည်သိမ်းဆည်းခြင်း
            await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
              method: 'PUT',
              headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
              },
              body: JSON.stringify({
                message: `Remove ordered items from ${file}`,
                content: Buffer.from(JSON.stringify(jsonContent, null, 2 )).toString('base64'),
                sha: fileData.sha
              })
            });
          }
        } catch (e) {
          console.error(e);
        }
      }));

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid request' });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
