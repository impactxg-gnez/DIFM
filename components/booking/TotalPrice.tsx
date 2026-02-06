export function TotalPrice({ amount }: { amount: number }) {
  return (
    <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg p-4 text-white">
      <div className="text-sm text-gray-400">Total Price</div>
      <div className="text-2xl font-black">£{Number(amount || 0).toFixed(2)}</div>
    </div>
  );
}


