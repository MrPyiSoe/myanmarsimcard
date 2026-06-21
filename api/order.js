export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone, address, cart, total } = req.body;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO;

  if (!botToken || !chatId || !githubToken || !githubRepo) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  try {
    // ၁။ Telegram သို့ အော်ဒါပို့ခြင်း
    let message = `📦 အော်ဒါအသစ် ရောက်ရှိပါသည်\n\n`;
    cart.forEach(item => {
      message += `✅ ${item.number} (${item.price})\n`;
    });
    message += `\n💰 စုစုပေါင်း - ${total}\n\n`;
    message += `👤 အမည်: ${name}\n`;
    message += `📞 ဖုန်း: ${phone}\n`;
    message += `🏠 လိပ်စာ: ${address}`;

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Order Confirm", callback_data: `confirm_${phone}` },
              { text: "❌ Cancel", callback_data: `cancel_${phone}` }
            ]
          ]
        }
      } )
    });

    // ၂။ GitHub မှ JSON ဖိုင်များကို Update လုပ်ခြင်း (ရောင်းပြီးသား ဖျက်ခြင်း)
    // မှတ်ချက် - လက်ရှိတွင် ooredoo.json တစ်ခုတည်းကိုသာ ဥပမာအနေဖြင့် ဖျက်ပြထားပါသည်။
    const fileUrl = `https://api.github.com/repos/${githubRepo}/contents/ooredoo.json`;
    
    const fileRes = await fetch(fileUrl, {
      headers: { 'Authorization': `Bearer ${githubToken}` }
    } );
    
    if (fileRes.ok) {
      const fileData = await fileRes.json();
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      let numbers = JSON.parse(content);

      // ခြင်းတောင်းထဲပါသော နံပါတ်များကို JSON ထဲမှ ဖယ်ထုတ်ခြင်း
      const cartNumbers = cart.map(item => item.number);
      numbers = numbers.filter(item => !cartNumbers.includes(item.number));

      const updatedContent = Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64');

      await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ooredoo.json (Order by ${name})`,
          content: updatedContent,
          sha: fileData.sha
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
