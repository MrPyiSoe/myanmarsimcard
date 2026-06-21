export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { name, phone, address, cart, total } = req.body;

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    // ၁။ Telegram သို့ အော်ဒါပို့ခြင်း
    let cartText = cart.map(item => `- ${item.number} (${item.price})`).join('\n');
    const text = `📦 အော်ဒါအသစ်ဝင်လာပါပြီ!\n\n👤 အမည်: ${name}\n📞 ဖုန်း: ${phone}\n📍 လိပ်စာ: ${address}\n\n🛒 ဝယ်ယူမည့် နံပါတ်များ:\n${cartText}\n\n💰 စုစုပေါင်း: ${total}`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Order Confirm", callback_data: "confirm" },
          { text: "❌ Order Cancelled", callback_data: "cancel" }
        ]
      ]
    };

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        reply_markup: replyMarkup
      } )
    });

    // ၂။ အော်ဒါတင်လိုက်သည်နှင့် JSON ဖိုင်များမှ ချက်ချင်း ဖျက်ပစ်ခြင်း (ယာယီဖျောက်ထားခြင်း)
    const orderedNumbers = cart.map(item => item.number);
    const files = ['mpt.json', 'atom.json', 'ooredoo.json', 'mytel.json'];

    await Promise.all(files.map(async (file) => {
      try {
        const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        } );
        if (!getRes.ok) return;
        
        const fileData = await getRes.json();
        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        let json = JSON.parse(content);

        const initialLength = json.length;
        json = json.filter(item => !orderedNumbers.includes(item.number));

        if (json.length < initialLength) {
          const newContent = Buffer.from(JSON.stringify(json, null, 2)).toString('base64');
          await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
              message: `Auto-removed pending numbers: ${orderedNumbers.join(', ' )}`,
              content: newContent,
              sha: fileData.sha
            })
          });
        }
      } catch (e) {
        console.error("GitHub Update Error:", e);
      }
    }));

    return res.status(200).json({ success: true });
  }
  res.status(405).json({ error: 'Method Not Allowed' });
}
