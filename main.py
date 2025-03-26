import discord
import os
import random
import asyncio
from dotenv import load_dotenv

# Load token dari .env
load_dotenv()
TOKEN = os.getenv("DISCORD_BOT_TOKEN")

# Inisialisasi bot dengan intents yang dibutuhkan
intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

# Daftar penerima file
RECEIVERS = ["umadimari", "zawarudo0797", "rizukun0055"]

# Waktu penghapusan otomatis dalam detik
AUTO_DELETE_DELAY = 10  # 10 menit (600 detik)


def split_txt_file(file_path):
    """Membagi file menjadi 3 bagian dan menetapkan kepada pengguna."""
    with open(file_path, "r", encoding="utf-8") as file:
        lines = file.readlines()

    total_lines = len(lines)
    if total_lines < 3:
        return {RECEIVERS[0]: file_path}  # Jika terlalu sedikit, kirim ke satu orang saja

    part_size = total_lines // 3
    parts = [
        lines[:part_size],
        lines[part_size:2 * part_size],
        lines[2 * part_size:]
    ]

    # Acak urutan penerima agar distribusi lebih merata
    random.shuffle(RECEIVERS)

    # Buat file pecahan dan tetapkan ke user tertentu
    part_files = {}
    for i, part in enumerate(parts):
        part_file = f"{RECEIVERS[i]}_part_{i + 1}.txt"
        with open(part_file, "w", encoding="utf-8") as f:
            f.writelines(part)
        part_files[RECEIVERS[i]] = part_file

    return part_files


async def delete_file(file_path):
    """Menghapus file jika ada di sistem."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"✅ File {file_path} telah dihapus.")
    except Exception as e:
        print(f"⚠️ Gagal menghapus {file_path}: {e}")


async def split_and_send(message, file_path):
    """Memproses file yang diterima, membaginya, menghapus, dan mengirimkan ke penerima."""
    try:
        assigned_files = split_txt_file(file_path)

        # Hapus file utama setelah dibagi
        asyncio.create_task(delete_file(file_path))

        # Hapus pesan asli setelah delay
        asyncio.create_task(delete_message_after_delay(message))

        part_files_to_delete = []  # Menyimpan daftar file yang perlu dihapus

        for user, part in assigned_files.items():
            sent_message = await message.channel.send(f"{user}, ini file untukmu:", file=discord.File(part))
            part_files_to_delete.append(part)

            # Hapus pesan yang dikirim setelah delay
            asyncio.create_task(delete_message_after_delay(sent_message))

        # Hapus semua file pecahan setelah delay
        await asyncio.sleep(AUTO_DELETE_DELAY)
        for part_file in part_files_to_delete:
            await delete_file(part_file)

    except Exception as e:
        await message.channel.send(f"❌ Terjadi kesalahan: {e}")


async def delete_message_after_delay(message):
    """Menghapus pesan setelah delay tertentu."""
    try:
        await asyncio.sleep(AUTO_DELETE_DELAY)
        await message.delete()
        print(f"🗑 Pesan dari {message.author} dihapus.")
    except discord.NotFound:
        print(f"⚠️ Pesan sudah dihapus sebelumnya.")
    except discord.Forbidden:
        print(f"🚫 Bot tidak memiliki izin untuk menghapus pesan.")
    except Exception as e:
        print(f"❌ Error menghapus pesan: {e}")


@client.event
async def on_message(message):
    """Menangani pesan yang dikirim oleh pengguna."""
    if message.author.bot:
        return  # Hindari bot merespons dirinya sendiri

    if message.attachments:
        for attachment in message.attachments:
            if attachment.filename.endswith(".txt"):
                file_path = f"./{attachment.filename}"
                try:
                    await attachment.save(file_path)
                    await split_and_send(message, file_path)
                except Exception as e:
                    await message.channel.send(f"⚠️ Error dalam memproses file: {e}")


# Menjalankan bot
client.run(TOKEN)
