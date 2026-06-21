export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;
    
    // Telegram ကနေ Button နှိပ်တဲ့ အချက်ပြချက် ဝင်လာရင်
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const action = callbackQuery.data; // 'confirm' သို့မဟုတ် 'cancel'
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const text = callbackQuery.message.text; // အော်ဒါ စာသားအပြည့်အစုံ

      const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

      // ❌ Order Cancelled ကို နှိပ်ခဲ့လျှင်
      if (action === 'cancel') {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text + "\n\n❌ ဤအော်ဒါကို ပယ်ဖျက်လိုက်ပါပြီ။ (နံပါတ်များ မဖျက်ပါ )"
          })
        });
        return res.status(200).send('OK');
      }

      // ✅ Order Confirm ကို နှိပ်ခဲ့လျှင်
      if (action === 'confirm') {
        // ၁။ စာသားထဲမှ 09 ဖြင့်စသော ဖုန်းနံပါတ်များကို ရှာဖွေခြင်း
        const phoneRegex = /09\d{7,9}/g;
        const orderedNumbers = text.match(phoneRegex) || [];

        // ၂။ GitHub ထဲရှိ JSON ဖိုင်များမှ အဆိုပါနံပါတ်များကို ဖျက်ခြင်း
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_REPO = process.env.GITHUB_REPO; 
        const files = ['mpt.json', 'atom.json', 'ooredoo.json', 'mytel.json'];

        for (const file of files) {
          try {
            // ဖိုင်ကို ဆွဲယူခြင်း
            const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
              headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            } );
            if (!getRes.ok) continue;
            
            const fileData = await getRes.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf8');
            let json = JSON.parse(content);

            // ရောင်းရသွားသော နံပါတ်များကို ဖယ်ထုတ်ခြင်း
            const initialLength = json.length;
            json = json.filter(item => !orderedNumbers.includes(item.number));

            // နံပါတ် လျော့သွားပါက (ရောင်းရသွားပါက) GitHub သို့ အသစ်ပြန်တင်ခြင်း
            if (json.length < initialLength) {
              const newContent = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
              await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `token ${GITHUB_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                  message: `Auto-removed sold numbers: ${orderedNumbers.join(', ' )}`,
                  content: newContent,
                  sha: fileData.sha
                })
              });
            }
          } catch (e) {
            console.error("GitHub Update Error:", e);
          }
        }

        // ၃။ Telegram မက်ဆေ့ချ်ကို အတည်ပြုပြီးကြောင်း ပြောင်းလဲခြင်း
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: text + "\n\n✅ အော်ဒါအတည်ပြုပြီးပါပြီ။ (နံပါတ်များကို ဝဘ်ဆိုက်မှ အလိုအလျောက် ဖျက်လိုက်ပါပြီ )"
          })
        });
        return res.status(200).send('OK');
      }
    }
    return res.status(200).send('OK');
  }
  res.status(405).send('Method Not Allowed');
}
