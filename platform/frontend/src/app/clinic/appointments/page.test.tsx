import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AppointmentsPage from "./page";
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

function mockAppointmentResponses() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === "/api/v1/scheduling/") {
      return Promise.resolve({
        count: 1,
        results: [{
          id: "appt-1", patient: "pat-1", appointment_type: "follow-up", status: "booked",
          start_time: new Date().toISOString(), end_time: new Date().toISOString(), description: "Follow-up visit",
          participants: [{ id: "part-1", actor_id: "prov-1", actor_type: "provider" }],
        }],
      });
    }
    if (path === "/api/v1/clinic/appointments/bookings/") {
      return Promise.resolve({ count: 1, results: [{ id: "cl-1", appointment: "appt-1", specialty_code: "Cardiology", checkin_status: "pending", source: "portal" }] });
    }
    if (path === "/api/v1/patients/") {
      return Promise.resolve({ count: 1, results: [{ id: "pat-1", first_name: "Ahmed", last_name: "Al-Rashid", mrn: "MRN-001234" }] });
    }
    if (path === "/api/v1/providers/") {
      return Promise.resolve({ count: 1, results: [{ id: "prov-1", first_name: "Sarah", last_name: "Johnson" }] });
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

describe("AppointmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a sign-in prompt when unauthenticated", () => {
    mockedUseAuth.mockReturnValue({ session: null, isAuthenticated: false, setSession: vi.fn(), logout: vi.fn() });
    render(<AppointmentsPage />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("loads and displays real appointment data joined from scheduling + patients + providers", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockAppointmentResponses();
    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Ahmed Al-Rashid")).toBeInTheDocument();
    });
    expect(screen.getByText("Dr. Sarah Johnson")).toBeInTheDocument();
    expect(screen.getByText("Appointment Scheduling")).toBeInTheDocument();
  });

  it("shows an explicit error state when the API call fails, never falls back to mock data", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockedApiFetch.mockRejectedValue(new Error("API unavailable"));
    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load appointments")).toBeInTheDocument();
    });
    expect(screen.queryByText("Ahmed Al-Rashid")).not.toBeInTheDocument();
  });

  it("language toggle switches heading to Arabic", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockAppointmentResponses();
    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Appointment Scheduling")).toBeInTheDocument();
    });
    const langBtn = screen.getByText("العربية");
    fireEvent.click(langBtn);
    await waitFor(() => {
      expect(screen.getByText("جدولة المواعيد")).toBeInTheDocument();
    });
  });

  it("Confirm button on a pending/proposed appointment PATCHes real status to booked", async () => {
    mockedUseAuth.mockReturnValue({ session: SESSION, isAuthenticated: true, setSession: vi.fn(), logout: vi.fn() });
    mockedApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/api/v1/scheduling/") {
        return Promise.resolve({
          count: 1,
          results: [{
            id: "appt-1", patient: "pat-1", appointment_type: "follow-up", status: "pending",
            start_time: new Date().toISOString(), end_time: new Date().toISOString(), description: "",
            participants: [],
          }],
        });
      }
      if (path === "/api/v1/clinic/appointments/bookings/") return Promise.resolve({ count: 0, results: [] });
      if (path === "/api/v1/patients/") return Promise.resolve({ count: 1, results: [{ id: "pat-1", first_name: "Ahmed", last_name: "Al-Rashid", mrn: "MRN-001234" }] });
      if (path === "/api/v1/providers/") return Promise.resolve({ count: 0, results: [] });
      if (path === "/api/v1/scheduling/appt-1/" && opts?.method === "PATCH") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });
    render(<AppointmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Ahmed Al-Rashid")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/api/v1/scheduling/appt-1/",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "booked" }) }),
      );
    });
  });
});
