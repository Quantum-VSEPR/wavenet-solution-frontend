# 🚀 Frontend for Wavenet Solutions 📝

Welcome to the frontend of Wavenet Solutions! This Next.js application provides a rich user interface for real-time note-taking and collaboration.

## ✨ Features

- **User Authentication** 🔑: Smooth login and registration experience.
- **Dashboard** 📊: Overview of user's notes.
- **Note Creation & Editing** ✍️: A rich text editor (ReactQuill) for creating and editing notes.
- **Real-time Collaboration** 👥: See who else is editing a note and get live updates when content changes.
- **Note Sharing** 🤝: Share notes with other users.
- **Search Functionality** 🔍: Find notes quickly.
- **Archiving** 🗄️: Archive and unarchive notes.
- **Notifications** 🔔: Real-time notifications for important events (e.g., note shared, note updated by collaborator).
- **Responsive Design** 📱: Works seamlessly on desktop and mobile devices.
- **Dark Mode** 🌙: Theme toggling for user preference.
- **Toast Notifications** 🍞: User-friendly feedback for actions.

## 🛠️ Tech Stack

- **Next.js** (v14+)
- **React** (v18+)
- **TypeScript**
- **Tailwind CSS**
- **Shadcn/UI** (for UI components)
- **React Quill** (for rich text editing)
- **Socket.IO Client** (for real-time communication)
- **Axios** (for HTTP requests)
- **React Hook Form** (for form management)
- **Zod** (for form validation)
- **date-fns** (for date formatting)
- **Lucide React** (for icons)
- **Next-Themes** (for theme management)

## ⚙️ Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/) or [pnpm](https://pnpm.io/)
- A running instance of the [backend server](link-to-your-backend-readme-or-repo).

## 🚀 Getting Started

1.  **Clone the repository (if you haven't already):**

    ```bash
    git clone <repository-url>
    cd wavenet-solutions/frontend
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the `frontend` directory and add the following variable:

    ```env
    NEXT_PUBLIC_API_URL=http://localhost:5000/api
    NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
    ```

    Replace `http://localhost:5000` with the actual URL of your running backend server if it's different.

4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```
    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/                 # Auth-related pages (login, register)
│   │   ├── (main)/                 # Main application layout and pages (dashboard, notes)
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Landing page
│   │   └── globals.css             # Global styles
│   ├── components/                 # UI components (reusable)
│   │   ├── auth/                   # Auth-specific components
│   │   ├── dashboard/              # Dashboard components
│   │   ├── layout/                 # Layout components (Navbar, etc.)
│   │   ├── notes/                  # Note-specific components (Editor, Item, Modals)
│   │   └── ui/                     # Shadcn/UI components
│   ├── contexts/                   # React Context API providers (Auth, Socket, Notification)
│   ├── hooks/                      # Custom React Hooks
│   ├── lib/                        # Utility functions, API helpers, socket setup
│   ├── services/                   # API service functions (authService, noteService)
│   └── types/                      # TypeScript type definitions
├── public/                         # Static assets
├── .env.local.example              # Example environment file
├── next.config.mjs                 # Next.js configuration
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## 📦 Available Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the application for production.
- `npm run start`: Starts a production server.
- `npm run lint`: Lints the codebase using Next.js's ESLint configuration.

## 🎨 Styling

- **Tailwind CSS**: Utility-first CSS framework for rapid UI development.
- **Shadcn/UI**: Re-usable components built using Radix UI and Tailwind CSS.
- **CSS Modules/Global CSS**: For component-specific styles or global overrides.

## 🌐 Environment Variables

- `NEXT_PUBLIC_API_URL`: The base URL for the backend API.
- `NEXT_PUBLIC_SOCKET_URL`: The URL for the Socket.IO server.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

---

Happy Coding! 🎉
