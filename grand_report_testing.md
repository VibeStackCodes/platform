# Playwright Test Tracking Services: Research Report

## Current Setup Analysis

**Config**: `playwright.config.ts` — sequential execution (workers: 1), HTML reporter, video `on`, screenshots `only-on-failure`, trace `on-first-retry`. Two projects: `mock` (fast, no real APIs) and `real` (full pipeline with GPT-5.2, Daytona, Supabase — 15min timeout). Tests run against `localhost:3000` with `pnpm build && pnpm start`. No CI reporter configured beyond built-in HTML.

**Test Suite**: 2 spec files, ~20 tests covering landing page, auth UI, middleware, dashboard, builder chat flow, deploy, and edit/iterate. The `real-generation.spec.ts` is a heavyweight integration test (up to 15 minutes).

**Gap**: No centralized test history, no trend tracking, no team-visible dashboard, no CI artifact management for videos/screenshots beyond local `test-results/`.

---

## Service Evaluation Matrix

| Service | Video | Screenshots | History/Trends | CI/CD (GH Actions) | Free Tier | Setup Complexity | Self-hosted | Dashboard UX |
|---------|-------|-------------|----------------|---------------------|-----------|-----------------|-------------|-------------|
| **Currents.dev** | Per-test, configurable | On failure + on demand | Excellent trends + flake detection | Native GH Actions | 500 records/mo, 3 members | Low (npm reporter) | No | Excellent |
| **ReportPortal** | Via attachments | Via attachments | ML-powered analytics, deep trends | Plugin available | Free self-hosted; SaaS tiered | Medium-High (Docker/K8s) | Yes | Good |
| **Allure TestOps** | Via allure-playwright | Step-level capture | Good historical analysis | CI plugins | Free trial; from $39/mo | Medium | Yes (on-prem) | Good |
| **Microsoft Playwright Testing** | Cloud execution only | Cloud execution only | Basic | Azure Pipelines native, GH Actions | Free trial | Low-Medium | No | Basic |
| **Checkly** | Monitoring-focused | Yes | Uptime/perf trends | Vercel + GH Actions | 1,500 browser runs/mo free | Low | No | Excellent |
| **BrowserStack** | Per-session recording | Auto + on-demand | Good dashboard | GH Actions integration | No free tier | Medium | No | Good |
| **LambdaTest (TestMu AI)** | Per-session recording | Auto + on-demand | Good | GH Actions integration | 1 parallel test free | Medium | No | Good |
| **Sauce Labs** | Per-session recording | Auto | Good trends | GH Actions via saucectl | Free trial; from $39/mo | Medium | No | Good |
| **QA Wolf** | Full recording | Full capture | Managed for you | Fully managed | None ($8K/mo min) | Zero (managed service) | No | N/A (managed) |
| **Playwright Built-in** | Local MP4 files | Local PNG files | None | Manual artifact upload | Free | Zero | N/A | HTML report only |

---

## Detailed Evaluations

### Tier 1: Playwright-Native Dashboards

#### 1. Currents.dev
- **What it is**: Purpose-built cloud dashboard for Playwright (and Cypress) test results
- **Video**: Records per-test videos; configurable retention; skipped recordings don't count toward billing
- **Screenshots**: Captures on failure and on demand; stored with test results
- **Trends**: Flake detection, failure clustering, historical pass/fail trends, execution time tracking
- **CI/CD**: Drop-in `@currents/playwright` npm reporter — 1-line config change. Native GitHub Actions support
- **Pricing**: Free tier = 500 test records/mo + 3 seats. Paid tiers scale by volume with embedded discounts. Enterprise custom pricing
- **Setup**: `npm i @currents/playwright` + add reporter to config + set API key. ~5 minutes
- **Strengths**: Lowest friction for Playwright teams; purpose-built UX; parallelization orchestration (or-orchestration) for CI sharding
- **Weaknesses**: Cloud-only; no self-hosted option; vendor lock-in on dashboard

#### 2. Playwright Built-in (HTML + Trace Viewer)
- **What it is**: Default reporters shipping with Playwright
- **Video**: Local MP4 recordings (already enabled in our config: `video: 'on'`)
- **Screenshots**: Local PNGs on failure (already configured)
- **Trends**: None — each run is standalone
- **CI/CD**: Upload `playwright-report/` and `test-results/` as GitHub Actions artifacts
- **Pricing**: Free
- **Setup**: Already configured
- **Strengths**: Zero cost; trace viewer is incredibly powerful for debugging; no external dependency
- **Weaknesses**: No history, no team dashboard, no flake detection, artifact cleanup needed in CI

### Tier 2: Test Management Platforms

#### 3. ReportPortal
- **What it is**: Open-source AI-powered test analytics platform with failure clustering
- **Video/Screenshots**: Sent as attachments via `agent-js-playwright` reporter
- **Trends**: ML-powered failure analysis, automatic grouping of similar failures, long-term trends
- **CI/CD**: Reporter plugin; async v2 API recommended for large suites
- **Pricing**: Free self-hosted (Docker/K8s); SaaS with shared or dedicated instances (contact for pricing)
- **Setup**: Deploy ReportPortal instance + configure reporter. Medium-high effort
- **Strengths**: Best-in-class failure analytics; self-hosted option for data sovereignty; supports 30+ frameworks
- **Weaknesses**: Operational overhead for self-hosted; UI dated compared to Currents; overkill for small suites

#### 4. Allure TestOps
- **What it is**: Full-stack test management with the popular Allure reporting format
- **Video/Screenshots**: Captured via `allure-playwright` adapter at step level
- **Trends**: Historical analysis, test case management, manual+automated test linking
- **CI/CD**: Plugins for all major CI systems
- **Pricing**: From $39/mo/user; free trial available; on-prem and cloud options
- **Setup**: Add `allure-playwright` + configure Allure TestOps server connection
- **Strengths**: Rich test management features; links manual and automated testing; beautiful reports
- **Weaknesses**: Per-user pricing expensive for larger teams; more than just reporting (may be overscoped)

### Tier 3: Cloud Browser Execution Platforms

#### 5. BrowserStack
- **What it is**: Cloud browser/device farm with 3500+ real devices
- **Video**: Automatic session recording with full diagnostic logs
- **Screenshots**: Auto-capture + on-demand; visual testing support
- **Trends**: Dashboard with historical runs
- **CI/CD**: GitHub Actions integration
- **Pricing**: From $12.50/mo; scales by parallel sessions
- **Setup**: Configure BrowserStack connector + capabilities
- **Strengths**: Real devices; massive browser coverage; established enterprise tool
- **Weaknesses**: Primarily a cloud execution platform (you're paying for browsers, not just reporting); higher cost

#### 6. LambdaTest (now TestMu AI)
- **What it is**: Cloud testing platform with 3000+ browser/device combinations
- **Video**: Per-session recording
- **Screenshots**: Auto-capture
- **CI/CD**: GitHub Actions integration
- **Pricing**: Free plan (1 parallel test); paid from $15/mo
- **Setup**: Configure LambdaTest connector
- **Strengths**: Good free tier; competitive pricing; recently rebranded with AI features
- **Weaknesses**: Similar to BrowserStack — cloud execution focus; less Playwright-specific

#### 7. Sauce Labs
- **What it is**: Enterprise cloud testing platform
- **Video**: Session recordings
- **Screenshots**: Auto-capture
- **Pricing**: From $39/mo; enterprise custom
- **Setup**: Via `saucectl` CLI
- **Strengths**: Enterprise-grade; broad framework support
- **Weaknesses**: Enterprise-focused pricing; less Playwright-specific

### Tier 4: Specialized / Adjacent

#### 8. Checkly
- **What it is**: Synthetic monitoring platform powered by Playwright
- **Video**: Monitoring-focused recordings
- **Screenshots**: Yes, per-check
- **Trends**: Uptime, performance, SLA tracking
- **CI/CD**: Vercel marketplace integration; GitHub Actions
- **Pricing**: Free hobby tier (1,500 browser runs/mo); Team $40/mo
- **Strengths**: Best for production monitoring; "monitoring as code"; Vercel integration
- **Weaknesses**: Not designed for test suite tracking — it's a monitoring tool

#### 9. Microsoft Playwright Testing (retiring March 2026)
- **What it is**: Azure-hosted parallel Playwright execution
- **Note**: **Being retired March 8, 2026** — migrating to Azure App Testing
- **Not recommended** due to imminent retirement

#### 10. QA Wolf
- **What it is**: Fully managed QA service — they write and maintain your Playwright tests
- **Pricing**: $8,000/mo minimum (up to 200 tests)
- **Not recommended** for our use case — we already have tests and don't need a managed service

---

## Top 3 Recommendations

### #1: Currents.dev (Recommended)

**Why**: Purpose-built for Playwright with the lowest setup friction. Drop-in npm reporter, instant dashboard, flake detection, and test history — exactly what's missing from our current setup. The free tier (500 records/mo) covers our current ~20 tests with room to grow. GitHub Actions integration is native.

**Setup effort**: ~15 minutes
```bash
pnpm add -D @currents/playwright
# Add to playwright.config.ts reporter array + set CURRENTS_RECORD_KEY
```

**Cost trajectory**: Free → ~$50-100/mo when scaling past 500 records

### #2: Playwright Built-in + GitHub Actions Artifacts (Cost-Conscious)

**Why**: We already have video and screenshot capture configured. The missing piece is just CI artifact storage and a way to view reports. GitHub Actions can upload `playwright-report/` as artifacts with retention policies. Combined with Playwright's trace viewer, this gives powerful debugging at zero additional cost.

**Setup effort**: ~30 minutes (CI workflow changes only)
```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 30
```

**Cost**: $0 (within GitHub Actions storage limits)

**Trade-off**: No historical trends, no team dashboard, no flake detection

### #3: ReportPortal (Scale / Analytics-Focused)

**Why**: Best option if the test suite grows significantly and failure analysis becomes a bottleneck. ML-powered failure clustering is genuinely useful at scale (100+ tests). Free self-hosted option provides data sovereignty.

**Setup effort**: 2-4 hours (deploy instance + configure reporter)

**Cost**: Free self-hosted; SaaS pricing by usage

**Trade-off**: Operational overhead; overkill for current suite size

---

## Decision Framework

| If your priority is... | Choose |
|------------------------|--------|
| Quick wins, best Playwright DX | **Currents.dev** |
| Zero cost, minimal change | **Built-in + GH Artifacts** |
| Enterprise analytics at scale | **ReportPortal** |
| Production uptime monitoring | **Checkly** (adjacent, not replacement) |
| Cross-browser coverage | **BrowserStack** or **LambdaTest** |

---

## Recommendation for VibeStack

Given the current state (20 tests, 2 spec files, early-stage project), the **recommended path** is:

1. **Immediate**: Configure GitHub Actions to upload Playwright HTML reports + videos as artifacts (zero cost, 30 min setup)
2. **When team grows to 3+ engineers**: Add Currents.dev free tier for shared dashboard and trend tracking
3. **When suite exceeds 100 tests**: Evaluate ReportPortal for failure analytics

This staged approach avoids premature vendor commitment while progressively adding capability as needs grow.
