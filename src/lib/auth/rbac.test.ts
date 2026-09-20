import { describe, it, expect } from "vitest";
import { hasPermission, isAtLeastRole } from "./rbac";

describe("Role-Based Access Control (RBAC)", () => {
  it("verifies OWNER role has all critical management permissions", () => {
    expect(hasPermission("OWNER", "workspace:manage")).toBe(true);
    expect(hasPermission("OWNER", "workspace:delete")).toBe(true);
    expect(hasPermission("OWNER", "members:manage")).toBe(true);
    expect(hasPermission("OWNER", "social_accounts:connect")).toBe(true);
    expect(hasPermission("OWNER", "content:publish")).toBe(true);
    expect(hasPermission("OWNER", "content:moderate")).toBe(true);
    expect(hasPermission("OWNER", "audit_logs:view")).toBe(true);
  });

  it("verifies ADMIN cannot delete workspace but can manage members and publish", () => {
    expect(hasPermission("ADMIN", "workspace:delete")).toBe(false);
    expect(hasPermission("ADMIN", "members:manage")).toBe(true);
    expect(hasPermission("ADMIN", "social_accounts:connect")).toBe(true);
    expect(hasPermission("ADMIN", "content:publish")).toBe(true);
    expect(hasPermission("ADMIN", "content:moderate")).toBe(true);
    expect(hasPermission("ADMIN", "audit_logs:view")).toBe(true);
  });

  it("verifies EDITOR can create and publish content but cannot manage members or view audit logs", () => {
    expect(hasPermission("EDITOR", "content:create")).toBe(true);
    expect(hasPermission("EDITOR", "content:publish")).toBe(true);
    expect(hasPermission("EDITOR", "content:moderate")).toBe(false);
    expect(hasPermission("EDITOR", "members:manage")).toBe(false);
    expect(hasPermission("EDITOR", "audit_logs:view")).toBe(false);
  });

  it("verifies ANALYST can view analytics and generate reports but cannot create content", () => {
    expect(hasPermission("ANALYST", "analytics:view")).toBe(true);
    expect(hasPermission("ANALYST", "reports:generate")).toBe(true);
    expect(hasPermission("ANALYST", "content:create")).toBe(false);
    expect(hasPermission("ANALYST", "content:publish")).toBe(false);
    expect(hasPermission("ANALYST", "content:moderate")).toBe(false);
  });

  it("verifies VIEWER has read-only analytics view permissions", () => {
    expect(hasPermission("VIEWER", "analytics:view")).toBe(true);
    expect(hasPermission("VIEWER", "reports:generate")).toBe(false);
    expect(hasPermission("VIEWER", "content:create")).toBe(false);
    expect(hasPermission("VIEWER", "content:moderate")).toBe(false);
    expect(hasPermission("VIEWER", "members:manage")).toBe(false);
  });

  it("verifies role hierarchy ordering accurately", () => {
    expect(isAtLeastRole("OWNER", "ADMIN")).toBe(true);
    expect(isAtLeastRole("ADMIN", "EDITOR")).toBe(true);
    expect(isAtLeastRole("EDITOR", "ANALYST")).toBe(true);
    expect(isAtLeastRole("ANALYST", "VIEWER")).toBe(true);

    expect(isAtLeastRole("VIEWER", "ANALYST")).toBe(false);
    expect(isAtLeastRole("ANALYST", "EDITOR")).toBe(false);
    expect(isAtLeastRole("EDITOR", "ADMIN")).toBe(false);
    expect(isAtLeastRole("ADMIN", "OWNER")).toBe(false);
  });
});
