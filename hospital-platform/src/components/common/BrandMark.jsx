export function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="currentColor" />
      <path d="M11.5 7h5v4.5H21v5h-4.5V21h-5v-4.5H7v-5h4.5z" fill="#fff" />
    </svg>
  );
}

