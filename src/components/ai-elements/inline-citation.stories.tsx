import type { Meta, StoryObj } from '@storybook/react'
import {
  InlineCitation,
  InlineCitationText,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselPrev,
  InlineCitationCarouselNext,
  InlineCitationSource,
  InlineCitationQuote,
} from './inline-citation'
import { citationSources, multipleSourceUrls } from './inline-citation.fixtures'

const meta = {
  title: 'AI/InlineCitation',
  component: InlineCitation,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof InlineCitation>

export default meta
type Story = StoryObj<typeof meta>

// Single source citation
export const SingleSource: Story = {
  render: () => (
    <p className="text-sm leading-relaxed max-w-prose">
      React 19 introduces many new features that improve developer experience{' '}
      <InlineCitation>
        <InlineCitationText>including the new use() hook</InlineCitationText>
        <InlineCitationCard>
          <InlineCitationCardTrigger sources={[citationSources[0].url]} />
          <InlineCitationCardBody>
            <InlineCitationCarousel>
              <InlineCitationCarouselContent>
                <InlineCitationCarouselItem>
                  <InlineCitationSource
                    title={citationSources[0].title}
                    url={citationSources[0].url}
                    description={citationSources[0].description}
                  />
                  {citationSources[0].quote && (
                    <InlineCitationQuote>{citationSources[0].quote}</InlineCitationQuote>
                  )}
                </InlineCitationCarouselItem>
              </InlineCitationCarouselContent>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
      .
    </p>
  ),
}

// Multiple sources in one citation badge
export const MultipleSources: Story = {
  render: () => (
    <p className="text-sm leading-relaxed max-w-prose">
      Modern web development with React and Tailwind CSS has evolved significantly{' '}
      <InlineCitation>
        <InlineCitationText>in recent years</InlineCitationText>
        <InlineCitationCard>
          <InlineCitationCardTrigger sources={multipleSourceUrls} />
          <InlineCitationCardBody>
            <InlineCitationCarousel>
              <InlineCitationCarouselHeader>
                <InlineCitationCarouselPrev />
                <InlineCitationCarouselIndex />
                <InlineCitationCarouselNext />
              </InlineCitationCarouselHeader>
              <InlineCitationCarouselContent>
                {citationSources.map((source) => (
                  <InlineCitationCarouselItem key={source.url}>
                    <InlineCitationSource
                      title={source.title}
                      url={source.url}
                      description={source.description}
                    />
                    {source.quote && (
                      <InlineCitationQuote>{source.quote}</InlineCitationQuote>
                    )}
                  </InlineCitationCarouselItem>
                ))}
              </InlineCitationCarouselContent>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
      .
    </p>
  ),
}

// Just the source card in isolation
export const SourceCard: Story = {
  render: () => (
    <div className="w-80">
      <InlineCitationSource
        title={citationSources[1].title}
        url={citationSources[1].url}
        description={citationSources[1].description}
      />
    </div>
  ),
}

// Source card with a quote
export const SourceCardWithQuote: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <InlineCitationSource
        title={citationSources[0].title}
        url={citationSources[0].url}
        description={citationSources[0].description}
      />
      <InlineCitationQuote>{citationSources[0].quote}</InlineCitationQuote>
    </div>
  ),
}
