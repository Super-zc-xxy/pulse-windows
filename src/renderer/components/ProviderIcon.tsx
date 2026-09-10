export function ProviderIcon({ name }: { name: string }) {
  if (name === 'claude') return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 14.5 9.5 22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" /></svg>
  if (name === 'openai') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9M12 12l6.36 6.36M12 12 5.64 5.64M12 12l-6.36 6.36M12 12l6.36-6.36" /></svg>
  if (name === 'antigravity') return <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 22,12 12,22 2,12" /><circle cx="12" cy="12" r="3" fill="#0e1014" /></svg>
  if (name === 'cursor') return <svg viewBox="0 0 24 24" fill="currentColor"><path d="m4 2 16 8.5-8.5 2.5L9 21.5 4 2Z" /></svg>
  if (name === 'kimi') return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.4 5.4 0 1 1-7.54-7.54A9 9 0 0 0 12 3Z" /></svg>
  return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8" /></svg>
}
