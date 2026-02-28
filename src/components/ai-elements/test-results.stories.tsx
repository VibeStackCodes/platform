import type { Meta, StoryObj } from '@storybook/react'
import {
  Test,
  TestDuration,
  TestError,
  TestErrorMessage,
  TestErrorStack,
  TestName,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestStatus,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from './test-results'

const meta = {
  title: 'AI/TestResults',
  component: TestResults,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TestResults>

export default meta
type Story = StoryObj<typeof meta>

export const AllPassing: Story = {
  args: {
    summary: {
      passed: 42,
      failed: 0,
      skipped: 2,
      total: 44,
      duration: 1823,
    },
  },
  render: (args) => (
    <TestResults {...args}>
      <TestResultsHeader>
        <TestResultsSummary />
        <TestResultsDuration />
      </TestResultsHeader>
      <TestResultsProgress />
      <TestResultsContent>
        <TestSuite name="Auth Suite" status="passed" defaultOpen>
          <TestSuiteName />
          <TestSuiteContent>
            <Test name="should login with valid credentials" status="passed" duration={45}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
            <Test name="should reject invalid password" status="passed" duration={32}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
            <Test name="should redirect after login" status="passed" duration={28}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
          </TestSuiteContent>
        </TestSuite>
        <TestSuite name="Dashboard Suite" status="passed">
          <TestSuiteName>
            <TestSuiteStats passed={3} />
          </TestSuiteName>
          <TestSuiteContent>
            <Test name="should render dashboard" status="passed" duration={18}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
          </TestSuiteContent>
        </TestSuite>
      </TestResultsContent>
    </TestResults>
  ),
}

export const WithFailures: Story = {
  args: {
    summary: {
      passed: 18,
      failed: 3,
      skipped: 1,
      total: 22,
      duration: 4201,
    },
  },
  render: (args) => (
    <TestResults {...args}>
      <TestResultsHeader>
        <TestResultsSummary />
        <TestResultsDuration />
      </TestResultsHeader>
      <TestResultsProgress />
      <TestResultsContent>
        <TestSuite name="Payment Suite" status="failed" defaultOpen>
          <TestSuiteName>
            <TestSuiteStats passed={1} failed={2} />
          </TestSuiteName>
          <TestSuiteContent>
            <Test name="should process payment" status="passed" duration={312}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
            <Test name="should handle declined card" status="failed" duration={89}>
              <TestStatus />
              <TestName />
              <TestDuration />
              <TestError>
                <TestErrorMessage>Expected status 402, received 500</TestErrorMessage>
                <TestErrorStack>
                  {`  at PaymentService.process (src/payment.ts:42)\n  at PaymentTest.run (tests/payment.test.ts:28)`}
                </TestErrorStack>
              </TestError>
            </Test>
            <Test name="should refund correctly" status="failed" duration={104}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
          </TestSuiteContent>
        </TestSuite>
      </TestResultsContent>
    </TestResults>
  ),
}

export const Running: Story = {
  args: {
    summary: {
      passed: 8,
      failed: 0,
      skipped: 0,
      total: 15,
      duration: undefined,
    },
  },
  render: (args) => (
    <TestResults {...args}>
      <TestResultsHeader>
        <TestResultsSummary />
      </TestResultsHeader>
      <TestResultsProgress />
      <TestResultsContent>
        <TestSuite name="Integration Suite" status="running" defaultOpen>
          <TestSuiteName />
          <TestSuiteContent>
            <Test name="should initialize database" status="passed" duration={55}>
              <TestStatus />
              <TestName />
              <TestDuration />
            </Test>
            <Test name="should seed test data" status="running">
              <TestStatus />
              <TestName />
            </Test>
            <Test name="should query records" status="skipped">
              <TestStatus />
              <TestName />
            </Test>
          </TestSuiteContent>
        </TestSuite>
      </TestResultsContent>
    </TestResults>
  ),
}

export const DefaultAutoRender: Story = {
  args: {
    summary: {
      passed: 10,
      failed: 2,
      skipped: 1,
      total: 13,
      duration: 2500,
    },
  },
}
