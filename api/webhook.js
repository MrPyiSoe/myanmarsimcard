export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;
    
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const action = callbackQuery.data; 
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const text = callbackQuery.message.text; 

      const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
      const GITHUB_REPO = process.env.GITHUB_REPO;

      // ✅ Order Confirm ကို နှိပ်ခဲ့လျှင် (နံပါတ်များ ချက်ချင်းဖျက်ပြီးသားဖြစ်၍ စာသားသာ ပြောင်းပေးမည်)
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

      // ❌ Order Cancelled ကို နှိပ်ခဲ့လျှင် (ဖျက်ထားသော နံပါတ်များကို ဝဘ်ဆိုက်သို့ ပြန်ထည့်ပေးမည်)
      if (action === 'cancel') {
        const lines = text.split('\n');
        const cancelledItems = [];
        
        // Telegram စာသားထဲမှ ဖုန်းနံပါတ်နှင့် ဈေးနှုန်းကို ပြန်ရှာခြင်း
        for (const line of lines) {
          if (line.startsWith('- 09')) {
            const match = line.match(/- (09[\d\s]+) \((.*?)\)/);
            if (match) {
              cancelledItems.push({ number: match[1].trim(), price: match[2].trim() });
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
                const content = Buffer.from(fileData.content, 'base64').toString('utf8');
                let json = JSON.parse(content);

                // ပယ်ဖျက်လိုက်သော နံပါတ်များကို JSON အဟောင်းထဲသို့ ပြန်ပေါင်းထည့်ခြင်း
                json = [...json, ...itemsToAdd];

                const newContent = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
                
                await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                  },
                  body: JSON.stringify({
                    message: `Restored cancelled numbers: ${itemsToAdd.map(i => i.number ).join(', ')}`,
                    content: newContent,
                    sha: fileData.sha
                  })
                });
              }
            } catch (e) {
              console.error("GitHub Restore Error:", e);
            }
          }));
        }

        // Telegram မက်ဆေ့ချ်ကို ပယ်ဖျက်ကြောင်း ပြောင်းလဲခြင်း
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text + "\n\n❌ ဤအော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။ (နံပါတ်များကို ဝဘ်ဆိုက်သို့ ပြန်လည်ထည့်သွင်းပေးလိုက်ပါပြီ )"
          })
        });
        return res.status(200).send('OK');
      }
    }
    return res.status(200).send('OK');
  }
  res.status(405).send('Method Not Allowed');
}
