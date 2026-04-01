import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">StableLabel</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Sensitivity label management for Microsoft 365
        </p>
        <button
          onClick={() => login()}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
