require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Storage } = require('megajs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const ALLOWED_CHANNEL_ID = process.env.ALLOWED_CHANNEL_ID;
const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASSWORD = process.env.MEGA_PASSWORD;
const AUTO_DELETE_DELAY = 24 * 60 * 60 * 1000; // 24 jam
const RECEIVERS = ["rizukun0055", "umadimari", "zawarudo0797"];

// Cek apakah environment variabel sudah diatur
if (!TOKEN || !ALLOWED_CHANNEL_ID || !MEGA_EMAIL || !MEGA_PASSWORD) {
    console.error("❌ Token, Channel ID, atau kredensial MEGA tidak ditemukan! Periksa file .env");
    process.exit(1);
}

// 🔹 Inisialisasi Discord Bot
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 🔹 Inisialisasi MEGA Storage
const mega = new Storage({ email: MEGA_EMAIL, password: MEGA_PASSWORD });

(async () => {
    try {
        await mega.ready;
        console.log("✅ Berhasil login ke MEGA.");
    } catch (err) {
        console.error("❌ Gagal login ke MEGA:", err);
        process.exit(1);
    }
})();

// 🔹 Fungsi Membagi File menjadi 3 bagian
async function splitTxtFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) throw new Error(`File ${filePath} tidak ditemukan.`);
        const data = fs.readFileSync(filePath, 'utf-8');
        const lines = data.split('\n');
        if (lines.length < 3) throw new Error("File terlalu kecil untuk dibagi menjadi 3 bagian.");

        const totalLines = lines.length;
        const partSize = Math.ceil(totalLines / 3);
        RECEIVERS.sort(() => Math.random() - 0.5);

        let partFiles = {};
        for (let i = 0; i < 3; i++) {
            const partFile = `${RECEIVERS[i]}_part_${i + 1}.txt`;
            const partContent = lines.slice(i * partSize, (i + 1) * partSize).join('\n');
            fs.writeFileSync(partFile, partContent, 'utf-8');
            console.log(`✅ Berhasil membuat bagian: ${partFile}`);
            partFiles[RECEIVERS[i]] = partFile;
        }
        return partFiles;
    } catch (err) {
        console.error("❌ Kesalahan saat membagi file:", err);
        return null;
    }
}

// 🔹 Fungsi Upload ke MEGA
async function uploadToMega(filePath) {
    try {
        if (!fs.existsSync(filePath)) throw new Error(`File ${filePath} tidak ditemukan.`);
        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;
        console.log(`🚀 Mengunggah ${fileName} ke MEGA (${fileSize} bytes)...`);

        const fileStream = fs.createReadStream(filePath);
        const upload = mega.upload({ name: fileName, size: fileSize });

        fileStream.pipe(upload);

        return new Promise((resolve, reject) => {
            upload.on('complete', (file) => {
                file.link((err, url) => {
                    if (err) {
                        console.error("❌ Gagal mendapatkan link MEGA:", err);
                        reject(null);
                    } else {
                        console.log(`✅ File ${fileName} berhasil diunggah ke MEGA: ${url}`);
                        resolve({ file, url });
                    }
                });
            });
            upload.on('error', (err) => {
                console.error("❌ Gagal mengunggah ke MEGA:", err);
                reject(null);
            });
        });
    } catch (err) {
        console.error("❌ Kesalahan upload ke MEGA:", err);
        return null;
    }
}

// 🔹 Fungsi Menghapus File dari MEGA
async function deleteFromMega(fileName) {
    try {
        const files = await mega.root.children;
        const file = files.find(f => f.name === fileName);
        if (!file) throw new Error(`File ${fileName} tidak ditemukan di MEGA.`);

        await file.delete(true);
        console.log(`✅ File ${fileName} berhasil dihapus dari MEGA`);
    } catch (err) {
        console.error(`❌ Gagal menghapus ${fileName} dari MEGA:`, err);
    }
}

// 🔹 Fungsi Mengunduh File dari Catbox
async function downloadFromCatbox(url) {
    try {
        const fileName = url.split('/').pop();
        const filePath = `downloaded_${fileName}`;
        console.log(`📥 Mengunduh file dari Catbox: ${url}`);

        const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        if (response.status !== 200) throw new Error(`Status ${response.status}`);

        fs.writeFileSync(filePath, response.data);
        console.log(`✅ File berhasil diunduh: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error(`❌ Gagal mengunduh ${url}: ${error.message}`);
        return null;
    }
}

// 🔹 Fungsi Memproses Link Catbox
async function processCatboxLink(message, url) {
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;
    const processingMessage = await message.channel.send("📥 Mengunduh dan memproses file...");

    const filePath = await downloadFromCatbox(url);
    if (!filePath) {
        await processingMessage.delete().catch(console.error);
        return message.channel.send("❌ Gagal mengunduh file dari Catbox.");
    }

    const assignedFiles = await splitTxtFile(filePath);
    if (!assignedFiles) {
        await processingMessage.delete().catch(console.error);
        return message.channel.send("❌ Gagal membagi file.");
    }

    let uploadedFiles = [];
    for (const partFile of Object.values(assignedFiles)) {
        const uploadResult = await uploadToMega(partFile);
        if (uploadResult) uploadedFiles.push(uploadResult);
        fs.unlinkSync(partFile);
    }
    fs.unlinkSync(filePath);

    if (uploadedFiles.length > 0) {
        const links = uploadedFiles.map(f => `${f.file.name}: ${f.url}`);
        const embed = new EmbedBuilder()
            .setTitle("📂 File Terbagi & Diunggah ke MEGA")
            .setColor(0x3498db)
            .setDescription(`⚠️ File ini akan dihapus dalam **${AUTO_DELETE_DELAY / 1000} detik** otomatis.`)
            .addFields(links.map(link => ({ name: "🔹 File", value: link, inline: false })));

        const sentMessage = await message.channel.send({ embeds: [embed] });

        setTimeout(async () => {
            for (const file of uploadedFiles) {
                await deleteFromMega(file.file.name);
            }
            await sentMessage.delete().catch(console.error);
        }, AUTO_DELETE_DELAY);
    }

    await processingMessage.delete().catch(console.error);
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== ALLOWED_CHANNEL_ID) return;
    const catboxMatch = message.content.match(/https?:\/\/files\.catbox\.moe\/[a-zA-Z0-9]+\.\w+/);
    if (catboxMatch) await processCatboxLink(message, catboxMatch[0]);
});

client.once('ready', () => console.log(`✅ Bot siap sebagai ${client.user.tag}`));
client.login(TOKEN);
