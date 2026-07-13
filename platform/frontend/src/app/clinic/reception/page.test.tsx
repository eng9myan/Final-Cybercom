import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReceptionPage from "./page";
import { useAuth } from "@/contexts/auth";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/contexts/auth", () => ({
  useAuth: vi.fn(),
}));

// Real (stateful) minimal stand-in rather than a static mock, so the language
// toggle actually re-renders across clicks like the real PreferencesProvider.
vi.mock("@/contexts/preferences", () => ({
  usePreferences: () => {
    const [locale, setLocale] = useState<"en" | "ar">("en");
    return { locale, setLocale, theme: "dark", setTheme: vi.fn(), toggleLocale: () => setLocale(l => (l === "en" ? "ar" : "en")), toggleTheme: vi.fn() };
  },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseAuth = vi.mocked(useAuth);

const SESSION = {
  userId: "u1",
  email: "ed@cy-com.com",
  realm: "cybercom",
  tenantId: "tenant-1",
  roles: [],
  permissions: [],
  accessToken: "token",
  tokenExpiresAt: Date.now() + 60_000,
};

function mockReceptionResponses() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === "/api/v1/clinic/reception/checkins/") {
      return Promise.resolve({
        count: 2,
        results: [
          {
            id: "ci-1", patient: "pat-1", appointment: null, arrival_method: "am-1", visit_reason: "vr-1",
            status: "vs-1", checkin_time: new Date().toISOString(),
            queue_ticket: { id: "tk-1", ticket_number: "T-101", status: "waiting", priority: "routine" },
          },
          {
            id: "ci-2", patient: "pat-2", appointment: null, arrival_method: "am-1", visit_reason: "vr-1",
            status: "vs-1", checkin_time: new Date().toISOString(),
            queue_ticket: { id: "tk-2", ticket_number: "T-102", status: "active", priority: "routine" },
          },
        ],
      });
    }
    if (path === "/api/v1/patients/") {
      return Promise.resolve({
        count: 2,
        results: [
          { id: "pat-1", first_name: "Ahmed", last_name: "Al-Rashid", mrn: "MRN-001234", dob: "1978-01-01" },
          { id: "pat-2", first_name: "Khalid", last_name: "Al-Nouri", mrn: "MRN-001238", dob: "1975-04-30" },
        ],
      });
    }
    if (path === "/api/v1/clinic/reception/arrival-methods/") {
      return Promise.resolve({ count: 1, results: [{ id: "am-1", name: "Walk-in", code: "walkin" }] });
    }
    if (path === "/api/v1/clinic/reception/visit-reasons/") {
      return Promise.resolve({ count: 1, results: [{ id: "vr-1", name: "Follow-up", code: "followup" }] });
    }
    if (path === "/api/v1/clinic/reception/visit-statuses/") {
      return Promise.resolve({ count: 1, results: [{ id: "vs-1", name: "Open", code: "open" }] });
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

describe("ReceptionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a sign-in prompt when unauthenticated", () => {
    mockedUseAuth.mockReturnValue({ session: null, isAuthenticated: false, setSession: vi.fn(), logout: vi.fn() });
    render(<ReceptionPage />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("loads and displays real check-in queue data joined from checkins + patients", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockReceptionResponses();
    render(<ReceptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Ahmed Al-Rashid")).toBeInTheDocument();
    });
    expect(screen.getByText("Khalid Al-Nouri")).toBeInTheDocument();
    expect(screen.getByText("Reception Desk")).toBeInTheDocument();
  });

  it("shows an explicit error state when the API call fails, never falls back to mock data", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockedApiFetch.mockRejectedValue(new Error("API unavailable"));
    render(<ReceptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load reception data")).toBeInTheDocument();
    });
    expect(screen.queryByText("Ahmed Al-Rashid")).not.toBeInTheDocument();
  });

  it("language toggle switches heading to Arabic", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockReceptionResponses();
    render(<ReceptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Reception Desk")).toBeInTheDocument();
    });
    const langBtn = screen.getByText("العربية");
    fireEvent.click(langBtn);
    await waitFor(() => {
      expect(screen.getByText("مكتب الاستقبال")).toBeInTheDocument();
    });
  });

  it("Call button on a waiting ticket PATCHes real ticket status to called", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockedApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/api/v1/clinic/reception/checkins/") {
        return Promise.resolve({
          count: 1,
          results: [{
            id: "ci-1", patient: "pat-1", appointment: null, arrival_method: "am-1", visit_reason: "vr-1",
            status: "vs-1", checkin_time: new Date().toISOString(),
            queue_ticket: { id: "tk-1", ticket_number: "T-101", status: "waiting", priority: "routine" },
          }],
        });
      }
      if (path === "/api/v1/patients/") return Promise.resolve({ count: 1, results: [{ id: "pat-1", first_name: "Ahmed", last_name: "Al-Rashid", mrn: "MRN-001234", dob: "1978-01-01" }] });
      if (path === "/api/v1/clinic/reception/arrival-methods/") return Promise.resolve({ count: 0, results: [] });
      if (path === "/api/v1/clinic/reception/visit-reasons/") return Promise.resolve({ count: 0, results: [] });
      if (path === "/api/v1/clinic/reception/visit-statuses/") return Promise.resolve({ count: 0, results: [] });
      if (path === "/api/v1/clinic/reception/tickets/tk-1/" && opts?.method === "PATCH") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });
    render(<ReceptionPage />);

    await waitFor(() => {
      expect(screen.getByText("Ahmed Al-Rashid")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/api/v1/clinic/reception/tickets/tk-1/",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "called" }) }),
      );
    });
  });
});
