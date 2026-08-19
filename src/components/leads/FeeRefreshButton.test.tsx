// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FeeRefreshButton } from './FeeRefreshButton';

// next/navigation mock
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// lucide-react mock — avoid SVG rendering issues in jsdom
vi.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="refresh-icon" className={className} />
  ),
}));

function setupFetch(response: { status?: number; body?: object }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok:     (response.status ?? 200) < 400,
    status: response.status ?? 200,
    json:   () => Promise.resolve(response.body ?? {}),
  });
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeeRefreshButton', () => {
  it('renders the refresh button', () => {
    render(<FeeRefreshButton leadId="lead-1" />);
    expect(screen.getByRole('button', { name: /refresh amazon fees/i })).toBeInTheDocument();
  });

  // Test 1 — Button renders for the component (OWNER is responsible for conditional render in page)
  it('is enabled by default', () => {
    render(<FeeRefreshButton leadId="lead-1" />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  // Test 3 — Click sends exactly one POST to the correct URL with no request body price
  it('sends exactly one POST to /api/leads/[id]/refresh-fees on click', async () => {
    setupFetch({ body: { ok: true, status: 'REFRESHED' } });
    render(<FeeRefreshButton leadId="lead-abc" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/leads/lead-abc/refresh-fees',
      { method: 'POST' },
    );
  });

  // Test 4 — REFRESHED calls router.refresh()
  it('calls router.refresh() on REFRESHED', async () => {
    setupFetch({ body: { ok: true, status: 'REFRESHED', profitUpdated: true } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Fees and profitability updated.')).toBeInTheDocument();
  });

  // Test 5 — REFRESHED_FEES_ONLY calls router.refresh()
  it('calls router.refresh() on REFRESHED_FEES_ONLY', async () => {
    setupFetch({ body: { ok: true, status: 'REFRESHED_FEES_ONLY', profitUpdated: false } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/source price missing/i)).toBeInTheDocument();
  });

  // Test 6 — SP_API_UNAVAILABLE does not call router.refresh() (no data changed)
  it('does NOT call router.refresh() on SP_API_UNAVAILABLE', async () => {
    setupFetch({ body: { ok: true, status: 'SP_API_UNAVAILABLE' } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // Test 7 — Loading state prevents duplicate clicks
  it('disables the button while loading to prevent duplicate clicks', async () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = vi.fn().mockReturnValue(
      new Promise((res) => { resolveFetch = res; }),
    );
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toBeDisabled();
    resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, status: 'SP_API_UNAVAILABLE' }) });
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
  });

  // Test 8 — Client does not mutate or display fake profit/ROI values
  it('does not display any profit, ROI, or fee values in the UI', async () => {
    setupFetch({ body: { ok: true, status: 'REFRESHED', profitUpdated: true } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Fees and profitability updated.')).toBeInTheDocument());
    // No synthetic dollar amounts or percentage numbers should appear — only the status message
    expect(screen.queryByText(/\$[\d.]+/)).toBeNull();
    expect(screen.queryByText(/\d+(\.\d+)?%/)).toBeNull();
  });

  it('shows an error message on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/refresh failed/i)).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows rate-limited message on 429', async () => {
    setupFetch({ status: 429, body: { error: 'RATE_LIMITED' } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/too many refresh requests/i)).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows error message on non-ok response other than 429', async () => {
    setupFetch({ status: 500, body: { error: 'Internal Server Error' } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/refresh failed/i)).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('clears previous result message on a new click', async () => {
    setupFetch({ body: { ok: true, status: 'SP_API_UNAVAILABLE' } });
    render(<FeeRefreshButton leadId="lead-1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());

    setupFetch({ body: { ok: true, status: 'REFRESHED' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Fees and profitability updated.')).toBeInTheDocument());
    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });
});

// Test 1 (role guard) and Test 2 (non-OWNER roles) live in the page server component,
// which conditionally renders <FeeRefreshButton /> only when session.user.role === 'OWNER'.
// These are integration concerns, not unit concerns for this client component.
