# Aviothic 2.0 / Anon-Chat 🛡️💬

**Instant Connection. Zero Identity.**

Aviothic 2.0 (also known as Anon-Chat) is a powerful, secure, and completely anonymous real-time chat application. Designed for privacy and speed, it allows users to create ephemeral chat rooms, share media, and communicate via voice without ever needing to create an account.

## 🚀 Key Features

### 🔒 Privacy & Security
-   **No Sign-ups**: Jump straight into a chat. No emails, no passwords.
-   **Anonymous Identities**: Choose any codename you like.
-   **Ephemeral Rooms**: Rooms are automatically deleted after 10 minutes of inactivity.
-   **Room Keys**: Access is controlled via secret room keys shared by the creator.
-   **Admin Controls**: Room creators can approve/deny join requests and remove users.

### 💬 Rich Communication
-   **Real-time Messaging**: Instant text delivery using Socket.io.
-   **Voice Chat**: Crystal clear, peer-to-peer voice calls using WebRTC. 📞
-   **Voice Messages**: Record and send audio snippets directly in the chat. 🎙️
-   **File Sharing**: Drag & drop support for images, videos, audio, and documents. 📁
-   **Rich Media**: Built-in support for GIFs (Giphy integration), Stickers, and Emojis. 😃

### 🎨 Modern Experience
-   **Responsive Design**: precise layouts for desktop and mobile devices. 📱💻
-   **Typing Indicators**: See when others are typing in real-time.
-   **Read Receipts**: Know exactly who has seen your messages.
-   **Dark Mode UI**: Sleek, glassmorphism-inspired aesthetic using Tailwind CSS.

## 🛠️ Tech Stack

-   **Backend**: Node.js, Express.js
-   **Real-time Engine**: Socket.io
-   **Frontend**: HTML5, Vanilla JavaScript
-   **Styling**: Tailwind CSS (custom configuration)
-   **Voice Protocol**: WebRTC (Peer-to-Peer)

## ⚙️ Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/mudit-code/Aviothic2.0_Codeforgers.git
    cd Aviothic2.0_Codeforgers
    ```

2.  **Install technical dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    *   The project uses a default port of `3000`. You can change this in `server.js` if needed.
    *   Ensure you have a GIPHY API key if you want to use the GIF feature (default key provided in code, but recommended to use your own).

4.  **Run the Server**
    ```bash
    node server.js
    ```
    *   *Or for development with auto-restart:*
    ```bash
    npm run dev  # (Requires nodemon)
    ```

5.  **Access the App**
    *   Open your browser and navigate to `http://localhost:3000`.

## 📖 Usage Guide

### Creating a Room
1.  Enter a **Username** (Codename).
2.  Enter a unique **Room Key**.
3.  Click **Create Room**.
4.  Share the Room Key with friends.

### Joining a Room
1.  Enter your **Username**.
2.  Enter the **Room Key** provided by the host.
3.  Click **Join Room**.
4.  Wait for the Admin (Room Creator) to approve your request.

### In-Chat Features
-   **Send Message**: Type and hit Enter or the Send button.
-   **Voice Call**: Click "Join Voice" in the header to enter the room's voice channel.
-   **Send Files**: Click the Paperclip icon or drag & drop files onto the chat.
-   **Send Voice Note**: Click the Microphone icon to start recording, then send.
-   **Send GIFs/Stickers**: Click the Smiley face icon to open the media picker.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).