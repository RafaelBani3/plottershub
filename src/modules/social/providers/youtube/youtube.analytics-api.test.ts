import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  YouTubeAnalyticsApiClient,
  YOUTUBE_ANALYTICS_METHOD_REPORTS_QUERY,
  YOUTUBE_ANALYTICS_QUOTA_COST_REPORTS_QUERY,
} from "./youtube.analytics-api";
import { SocialError } from "../../errors";
import { YouTubeAnalyticsResultTable } from "./youtube.types";

describe("Phase 3.3A: YouTubeAnalyticsApiClient (reports.query)", () => {
  let client: YouTubeAnalyticsApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockValidToken = "ya29.a0AfH6SMB_valid_access_token_12345";

  const mockSuccessResult: YouTubeAnalyticsResultTable = {
    kind: "youtubeAnalytics#resultTable",
    columnHeaders: [
      { name: "day", columnType: "DIMENSION", dataType: "STRING" },
      { name: "views", columnType: "METRIC", dataType: "INTEGER" },
      { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewDuration", columnType: "METRIC", dataType: "INTEGER" },
      { name: "averageViewPercentage", columnType: "METRIC", dataType: "FLOAT" },
      { name: "likes", columnType: "METRIC", dataType: "INTEGER" },
      { name: "shares", columnType: "METRIC", dataType: "INTEGER" },
      { name: "subscribersGained", columnType: "METRIC", dataType: "INTEGER" },
    ],
    rows: [
      ["2026-03-01", 15420, 68400, 266, 62.45, 840, 120, 45],
      ["2026-03-02", 18200, 79200, 261, 61.8, 980, 145, 52],
    ],
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new YouTubeAnalyticsApiClient(
      "https://youtubeanalytics.googleapis.com/v2",
      { maxRetries: 2, initialDelayMs: 5, maxDelayMs: 20, timeoutMs: 5000 },
      mockFetch as any
    );
  });

  // ---------------------------------------------------------------------------
  // A & B & O: Successful Query, URL Parameter Construction & Response Parsing
  // ---------------------------------------------------------------------------
  it("A, B & O: successfully executes reports.query and constructs query parameters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccessResult,
    });

    const result = await client.queryReport(mockValidToken, {
      ids: "channel==MINE",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      metrics: ["views", "estimatedMinutesWatched", "averageViewDuration", "likes", "shares", "subscribersGained"],
      dimensions: ["day"],
      filters: "country==US",
      sort: ["day"],
      maxResults: 50,
      startIndex: 1,
      includeHistoricalChannelData: true,
    });

    expect(result.kind).toBe("youtubeAnalytics#resultTable");
    expect(result.columnHeaders).toHaveLength(8);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][0]).toBe("2026-03-01");
    expect(result.rows[0][1]).toBe(15420);

    // Verify HTTP Call details
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = mockFetch.mock.calls[0];
    const url = new URL(callUrl);

    expect(url.origin + url.pathname).toBe("https://youtubeanalytics.googleapis.com/v2/reports");
    expect(url.searchParams.get("ids")).toBe("channel==MINE");
    expect(url.searchParams.get("startDate")).toBe("2026-03-01");
    expect(url.searchParams.get("endDate")).toBe("2026-03-02");
    expect(url.searchParams.get("metrics")).toBe(
      "views,estimatedMinutesWatched,averageViewDuration,likes,shares,subscribersGained"
    );
    expect(url.searchParams.get("dimensions")).toBe("day");
    expect(url.searchParams.get("filters")).toBe("country==US");
    expect(url.searchParams.get("sort")).toBe("day");
    expect(url.searchParams.get("maxResults")).toBe("50");
    expect(url.searchParams.get("startIndex")).toBe("1");
    expect(url.searchParams.get("includeHistoricalChannelData")).toBe("true");

    // Verify Authorization Header (access token NOT in URL query params)
    expect(url.searchParams.get("access_token")).toBeNull();
    expect(callInit.headers.Authorization).toBe(`Bearer ${mockValidToken}`);
    expect(callInit.headers.Accept).toBe("application/json");
  });

  // ---------------------------------------------------------------------------
  // C: Required Parameter Validation
  // ---------------------------------------------------------------------------
  it("C: rejects requests missing accessToken or required parameters", async () => {
    // Missing accessToken
    await expect(
      client.queryReport("", {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "SOCIAL_AUTH_REQUIRED",
        statusCode: 401,
      })
    );

    // Missing ids
    await expect(
      client.queryReport(mockValidToken, {
        ids: "",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "SOCIAL_INVALID_REQUEST",
        statusCode: 400,
      })
    );
  });

  // ---------------------------------------------------------------------------
  // D, E, F, G: Date and Input Validation
  // ---------------------------------------------------------------------------
  it("D: rejects invalid date formats (not YYYY-MM-DD)", async () => {
    await expect(
      client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "03/01/2026", // Invalid format
        endDate: "2026-03-02",
        metrics: ["views"],
      })
    ).rejects.toThrowError(/Must be formatted as YYYY-MM-DD/);
  });

  it("E: rejects startDate > endDate", async () => {
    await expect(
      client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-10",
        endDate: "2026-03-01", // Earlier than startDate
        metrics: ["views"],
      })
    ).rejects.toThrowError(/must not be after 'endDate'/);
  });

  it("F: rejects empty or whitespace-only metrics", async () => {
    await expect(
      client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: [],
      })
    ).rejects.toThrowError(/Missing required 'metrics' parameter/);
  });

  it("G: rejects maxResults and startIndex out of bounds", async () => {
    // maxResults > 200
    await expect(
      client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
        maxResults: 500,
      })
    ).rejects.toThrowError(/Must be an integer between 1 and 200/);

    // maxResults < 1
    await expect(
      client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
        maxResults: 0,
      })
    ).rejects.toThrowError(/Must be an integer between 1 and 200/);

    // startIndex < 1
    await expect(
      client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
        startIndex: 0,
      })
    ).rejects.toThrowError(/Must be an integer greater than or equal to 1/);
  });

  // ---------------------------------------------------------------------------
  // H, I, J: Error Mapping (400, 401, 403)
  // ---------------------------------------------------------------------------
  it("H: maps HTTP 400 invalidCombination error to SOCIAL_INVALID_REQUEST", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: "The combination of dimensions and metrics is not supported.",
          errors: [{ reason: "invalidCombination" }],
        },
      }),
    });

    let error: any = null;
    try {
      await client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
        dimensions: ["day", "ageGroup,gender"], // Invalid combination
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(SocialError);
    expect(error.code).toBe("SOCIAL_INVALID_REQUEST");
    expect(error.statusCode).toBe(400);
    expect(error.retryable).toBe(false);
  });

  it("I: maps HTTP 401 unauthorized to SOCIAL_AUTH_REQUIRED with userActionRequired", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: 401,
          message: "Request had invalid authentication credentials.",
          errors: [{ reason: "authError" }],
        },
      }),
    });

    let error: any = null;
    try {
      await client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(SocialError);
    expect(error.code).toBe("SOCIAL_AUTH_REQUIRED");
    expect(error.statusCode).toBe(401);
    expect(error.userActionRequired).toBe(true);
  });

  it("J: maps HTTP 403 quota/rateLimit vs insufficient permissions", async () => {
    // 403 Quota Exceeded -> SOCIAL_RATE_LIMITED (retryable: true)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 403,
          message: "User rate limit exceeded.",
          errors: [{ reason: "rateLimitExceeded" }],
        },
      }),
    });

    try {
      await client.queryReport(
        mockValidToken,
        {
          ids: "channel==MINE",
          startDate: "2026-03-01",
          endDate: "2026-03-02",
          metrics: ["views"],
        },
        { maxRetries: 0 } // Disable retries to test mapping
      );
    } catch (err: any) {
      expect(err.code).toBe("SOCIAL_RATE_LIMITED");
      expect(err.retryable).toBe(true);
    }

    // 403 Insufficient Permissions -> SOCIAL_PERMISSION_MISSING
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 403,
          message: "The caller does not have permission.",
          errors: [{ reason: "forbidden" }],
        },
      }),
    });

    try {
      await client.queryReport(
        mockValidToken,
        {
          ids: "channel==MINE",
          startDate: "2026-03-01",
          endDate: "2026-03-02",
          metrics: ["views"],
        },
        { maxRetries: 0 }
      );
    } catch (err: any) {
      expect(err.code).toBe("SOCIAL_PERMISSION_MISSING");
      expect(err.userActionRequired).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // K & L & M: Retry Behavior (429, 5xx, Exhaustion)
  // ---------------------------------------------------------------------------
  it("K: retries on HTTP 429 rate limit and succeeds on retry", async () => {
    // Attempt 1: 429
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Too many requests" } }),
    });

    // Attempt 2: 200 OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccessResult,
    });

    const result = await client.queryReport(mockValidToken, {
      ids: "channel==MINE",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      metrics: ["views"],
    });

    expect(result.rows).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("L: retries on transient HTTP 500/503 and succeeds on retry", async () => {
    // Attempt 1: 503 Service Unavailable
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Backend error" } }),
    });

    // Attempt 2: 200 OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccessResult,
    });

    const result = await client.queryReport(mockValidToken, {
      ids: "channel==MINE",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      metrics: ["views"],
    });

    expect(result.rows).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("M: exhausts maxRetries and throws SOCIAL_API_ERROR", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 500, message: "Internal Server Error" } }),
    });

    await expect(
      client.queryReport(
        mockValidToken,
        {
          ids: "channel==MINE",
          startDate: "2026-03-01",
          endDate: "2026-03-02",
          metrics: ["views"],
        },
        { maxRetries: 2, initialDelayMs: 2 }
      )
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "SOCIAL_API_ERROR",
        statusCode: 500,
        retryable: true,
      })
    );

    // Initial attempt + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // N: Network Timeout / Abort Handling
  // ---------------------------------------------------------------------------
  it("N: handles AbortError/timeout as retryable error", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";

    mockFetch.mockRejectedValue(abortErr);

    await expect(
      client.queryReport(
        mockValidToken,
        {
          ids: "channel==MINE",
          startDate: "2026-03-01",
          endDate: "2026-03-02",
          metrics: ["views"],
        },
        { maxRetries: 1, initialDelayMs: 2 }
      )
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "SOCIAL_API_ERROR",
        statusCode: 504,
        retryable: true,
      })
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // P & Q: Large Integer & Decimal Precision Preservation
  // ---------------------------------------------------------------------------
  it("P & Q: preserves large integer and decimal values in response table", async () => {
    const precisionPayload: YouTubeAnalyticsResultTable = {
      kind: "youtubeAnalytics#resultTable",
      columnHeaders: [
        { name: "video", columnType: "DIMENSION", dataType: "STRING" },
        { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        { name: "estimatedMinutesWatched", columnType: "METRIC", dataType: "INTEGER" },
        { name: "averageViewPercentage", columnType: "METRIC", dataType: "FLOAT" },
        { name: "viewerPercentage", columnType: "METRIC", dataType: "FLOAT" },
      ],
      rows: [
        ["vid-big-1", 9007199254740991, 50000000000, 88.75, 4.32],
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => precisionPayload,
    });

    const result = await client.queryReport(mockValidToken, {
      ids: "channel==MINE",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      metrics: ["views", "estimatedMinutesWatched", "averageViewPercentage", "viewerPercentage"],
      dimensions: ["video"],
    });

    expect(result.rows[0][1]).toBe(9007199254740991);
    expect(result.rows[0][2]).toBe(50000000000);
    expect(result.rows[0][3]).toBe(88.75);
    expect(result.rows[0][4]).toBe(4.32);
  });

  // ---------------------------------------------------------------------------
  // R & S: Security Review — Zero Token Leakage in Errors & Logs
  // ---------------------------------------------------------------------------
  it("R & S: ensures OAuth access token is never leaked in error messages or query string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: `Invalid token: Bearer ${mockValidToken} supplied.`,
        },
      }),
    });

    let thrownError: any = null;
    try {
      await client.queryReport(mockValidToken, {
        ids: "channel==MINE",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
        metrics: ["views"],
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    // Message must be sanitized
    expect(thrownError.message).not.toContain(mockValidToken);
    expect(thrownError.message).toContain("[REDACTED");

    // Check URL did not have token
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).not.toContain(mockValidToken);
  });

  // ---------------------------------------------------------------------------
  // T: Quota Integration Constants
  // ---------------------------------------------------------------------------
  it("T: exposes quota method identifier and standard cost unit", () => {
    expect(YOUTUBE_ANALYTICS_METHOD_REPORTS_QUERY).toBe("reports.query");
    expect(YOUTUBE_ANALYTICS_QUOTA_COST_REPORTS_QUERY).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // V: URL Search Parameter Encoding & Injection Defense
  // ---------------------------------------------------------------------------
  it("V: properly encodes parameters without URL injection vulnerabilities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccessResult,
    });

    await client.queryReport(mockValidToken, {
      ids: "channel==MINE",
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      metrics: ["views"],
      filters: "country==US;video==dQw4w9WgXcQ&malicious=param",
    });

    const [callUrl] = mockFetch.mock.calls[0];
    const url = new URL(callUrl);
    // URLSearchParams automatically encodes & and ; in filter values
    expect(url.searchParams.get("filters")).toBe("country==US;video==dQw4w9WgXcQ&malicious=param");
    expect(url.searchParams.get("malicious")).toBeNull();
  });
});
