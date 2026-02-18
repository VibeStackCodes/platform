
import type { SchemaContract } from '../../../schema-contract'
import type { VibeStackSkill } from '../../types'

export const skill: VibeStackSkill = {
  name: 'theme-cottage',
  envVars: [],

  applyToSchema(contract: SchemaContract) {
    
    // Add product table for store themes
    if (!contract.tables.some(t => t.name === 'products')) {
      return {
        ...contract,
        tables: [
          ...contract.tables,
          {
            name: 'products',
            columns: [
              { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
              { name: 'name', type: 'text', nullable: false },
              { name: 'price', type: 'decimal', nullable: false },
              { name: 'description', type: 'text', nullable: true },
              { name: 'image_url', type: 'text', nullable: true }
            ]
          }
        ]
      }
    }
    
    
    return contract;
  },

  generateRoutes(contract: SchemaContract) {
    return {
      '/': `
        import { useState } from 'react'
        import { Button } from '@/components/ui/button'
        
        export default function HomePage() {
          return (
            <div className="min-h-screen bg-[#ffffff] text-[#000000] font-['Albert Sans']">
              {/* Navigation */}
              <nav className="p-6 flex justify-between items-center border-b border-[#eaeaea]">
                <h1 className="text-2xl font-bold tracking-tight">Cottage</h1>
                <div className="space-x-4">
                  <a href="/about" className="hover:text-[#a34e00]">About</a>
                  <a href="/shop" className="hover:text-primary">Shop</a>
                  
                  <a href="/contact" className="hover:text-primary">Contact</a>
                </div>
              </nav>

              {/* Hero Section */}
              <main className="container mx-auto px-6 py-20 text-center">
                <h2 className="text-6xl font-extrabold mb-6 leading-tight tracking-tight">
                  Curated Essentials
                </h2>
                <p className="text-xl opacity-80 max-w-2xl mx-auto mb-10">
                  Close the navigation menu
                </p>
                <Button size="lg" className="bg-[#a34e00] text-white px-8 py-6 text-lg rounded-full">
                  Shop Now
                </Button>
              </main>

              {/* Grid Section */}
              <section className="container mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden relative group cursor-pointer">
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-6 left-6">
                      <h3 className="text-xl font-bold">Featured Item {i}</h3>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )
        }
      `,
      '/about': `
        export default function AboutPage() {
          return (
            <div className="container mx-auto px-6 py-20 max-w-2xl">
              <h1 className="text-4xl font-bold mb-8">About Us</h1>
              <div className="prose prose-lg">
                <p>We are a creative studio dedicated to building beautiful digital experiences. Our approach is rooted in simplicity and function.</p>
              </div>
            </div>
          )
        }
      `,
      
      '/shop': `
        export default function ShopPage() {
          return (
            <div className="container mx-auto px-6 py-20">
              <h1 className="text-4xl font-bold mb-12">Shop</h1>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Product Grid Mock */}
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="group">
                    <div className="aspect-square bg-gray-100 mb-4 rounded-lg" />
                    <h3 className="font-medium">Product Name {i}</h3>
                    <p className="text-gray-500">$99.00</p>
                  </div>
                ))}
              </div>
            </div>
          )
        }
      `,
      
      '/contact': `
        import { Button } from '@/components/ui/button'
        import { Input } from '@/components/ui/input'
        import { Textarea } from '@/components/ui/textarea'

        export default function ContactPage() {
          return (
            <div className="container mx-auto px-6 py-20 max-w-xl">
              <h1 className="text-4xl font-bold mb-8">Get in Touch</h1>
              <form className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  <Input placeholder="Your name" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <Input type="email" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Message</label>
                  <Textarea rows={6} placeholder="How can we help?" />
                </div>
                <Button className="w-full">Send Message</Button>
              </form>
            </div>
          )
        }
      `
    }
  }
}
