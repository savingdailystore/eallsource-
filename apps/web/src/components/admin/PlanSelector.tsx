'use client';

export function PlanSelector({ userId, plan }: { userId: string; plan: string }) {
  return (
    <select
      defaultValue={plan}
      onChange={async (e) => {
        await fetch('/api/admin', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource: 'user',
            id: userId,
            data: { subscriptionPlan: e.target.value },
          }),
        });
      }}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
    >
      <option value="FREE">Free</option>
      <option value="STARTER">Starter</option>
      <option value="PRO">Pro</option>
      <option value="ENTERPRISE">Enterprise</option>
    </select>
  );
}
