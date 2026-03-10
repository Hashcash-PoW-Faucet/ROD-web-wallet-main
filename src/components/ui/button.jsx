export function Button({ children, onClick, disabled }) {
  return (
    <button
      className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
