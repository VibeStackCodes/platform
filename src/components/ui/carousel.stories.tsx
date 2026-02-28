import type { Meta, StoryObj } from '@storybook/react'

import { Card, CardContent } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'

const meta = {
  title: 'UI/Carousel',
  component: Carousel,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Carousel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {Array.from({ length: 5 }, (_, i) => (
          <CarouselItem key={i}>
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  <span className="text-4xl font-semibold">{i + 1}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const MultipleItems: Story = {
  render: () => (
    <Carousel
      opts={{ align: 'start' }}
      className="w-full max-w-sm"
    >
      <CarouselContent className="-ml-1">
        {Array.from({ length: 8 }, (_, i) => (
          <CarouselItem key={i} className="pl-1 md:basis-1/2 lg:basis-1/3">
            <div className="p-1">
              <Card>
                <CardContent className="flex aspect-square items-center justify-center p-6">
                  <span className="text-2xl font-semibold">{i + 1}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}

export const ImageSlideshow: Story = {
  render: () => {
    const colors = [
      'from-violet-500 to-purple-600',
      'from-blue-500 to-cyan-600',
      'from-green-500 to-emerald-600',
      'from-orange-500 to-amber-600',
      'from-red-500 to-rose-600',
    ]

    return (
      <Carousel className="w-full max-w-md">
        <CarouselContent>
          {colors.map((color, i) => (
            <CarouselItem key={i}>
              <div
                className={`flex h-48 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white`}
              >
                <div className="text-center">
                  <p className="text-2xl font-bold">Slide {i + 1}</p>
                  <p className="text-sm opacity-80">Beautiful gradient card</p>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    )
  },
}

export const Vertical: Story = {
  render: () => (
    <Carousel
      orientation="vertical"
      opts={{ align: 'start' }}
      className="w-full max-w-xs"
    >
      <CarouselContent className="-mt-1 h-[200px]">
        {Array.from({ length: 5 }, (_, i) => (
          <CarouselItem key={i} className="pt-1 md:basis-1/2">
            <div className="p-1">
              <Card>
                <CardContent className="flex items-center justify-center p-6">
                  <span className="text-3xl font-semibold">{i + 1}</span>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
}
