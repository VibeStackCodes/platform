import { PageProgressCard } from '@/components/ai-elements/page-progress-card'
import {
  Test,
  TestResults,
  TestResultsContent,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from '@/components/ai-elements/test-results'

const MOCK_PAGES = [
  {
    fileName: 'src/pages/Dashboard.tsx',
    route: '/',
    componentName: 'Dashboard',
    status: 'complete' as const,
    lineCount: 142,
  },
  {
    fileName: 'src/pages/Analytics.tsx',
    route: '/analytics',
    componentName: 'Analytics',
    status: 'complete' as const,
    lineCount: 89,
  },
  {
    fileName: 'src/pages/Settings.tsx',
    route: '/settings',
    componentName: 'Settings',
    status: 'generating' as const,
  },
  {
    fileName: 'src/pages/Profile.tsx',
    route: '/profile',
    componentName: 'Profile',
    status: 'pending' as const,
  },
]

export function DataDisplay() {
  return (
    <div className="space-y-6">
      {/* Test Results — compound component pattern */}
      <TestResults
        summary={{ passed: 18, failed: 2, skipped: 1, total: 21, duration: 3420 }}
      >
        <TestResultsHeader>
          <TestResultsSummary />
        </TestResultsHeader>
        <TestResultsProgress />
        <TestResultsContent>
          <TestSuite name="Dashboard" status="passed" defaultOpen>
            <TestSuiteName>
              <TestSuiteStats passed={5} />
            </TestSuiteName>
            <TestSuiteContent>
              <Test name="renders revenue card" status="passed" duration={12} />
              <Test name="renders active users" status="passed" duration={8} />
              <Test name="shows loading skeleton" status="passed" duration={15} />
              <Test name="handles empty data" status="passed" duration={10} />
              <Test name="formats currency correctly" status="passed" duration={6} />
            </TestSuiteContent>
          </TestSuite>
          <TestSuite name="Auth" status="failed">
            <TestSuiteName>
              <TestSuiteStats passed={3} failed={2} />
            </TestSuiteName>
            <TestSuiteContent>
              <Test name="login with valid credentials" status="passed" duration={245} />
              <Test name="redirects after login" status="passed" duration={88} />
              <Test name="shows error on invalid email" status="failed" duration={34} />
              <Test name="clears form on cancel" status="passed" duration={22} />
              <Test name="handles network timeout" status="failed" duration={5001} />
            </TestSuiteContent>
          </TestSuite>
        </TestResultsContent>
      </TestResults>

      {/* Page Progress Card — flat props pattern */}
      <PageProgressCard pages={MOCK_PAGES} />
    </div>
  )
}
