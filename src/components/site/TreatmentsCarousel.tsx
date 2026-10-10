'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Treatment } from '@/config/site'

interface TreatmentsCarouselProps {
  treatments: Treatment[]
}

export function TreatmentsCarousel({ treatments }: TreatmentsCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { clientWidth } = scrollRef.current
      const scrollAmount = direction === 'left' ? -(clientWidth * 0.8) : (clientWidth * 0.8)
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  // Re-order treatments based on priority
  const priorityOrder = ['consultation', 'x-ray', 'fillings', 'root-canal-treatment']
  
  const sortedTreatments = [...treatments].sort((a, b) => {
    const indexA = priorityOrder.indexOf(a.slug)
    const indexB = priorityOrder.indexOf(b.slug)
    
    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1
    return 0
  })

  // Helper to extract the minimum price
  const getStartingPrice = (pricing?: { detail: string; cost: string }[]) => {
    if (!pricing || pricing.length === 0) return null;
    let minPrice = Infinity;
    let minStr = '';
    pricing.forEach(p => {
      // Find the first sequence of digits, optionally with commas
      const match = p.cost.match(/[\d,]+/);
      if (match) {
        const num = parseInt(match[0].replace(/,/g, ''), 10);
        if (num < minPrice) {
          minPrice = num;
          minStr = match[0];
        }
      }
    });
    return minStr ? `₹${minStr}` : null;
  }

  return (
    <div className="relative group max-w-full">
      {/* Scroll Buttons - Hidden on touch, visible on hover for desktop */}
      <button 
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 lg:-translate-x-6 z-10 hidden md:group-hover:flex bg-white/95 shadow-xl hover:bg-white text-blue-600 rounded-full p-3 items-center justify-center transition-all focus:outline-none ring-1 ring-black/5 hover:scale-110"
        aria-label="Scroll left"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button 
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 lg:translate-x-6 z-10 hidden md:group-hover:flex bg-white/95 shadow-xl hover:bg-white text-blue-600 rounded-full p-3 items-center justify-center transition-all focus:outline-none ring-1 ring-black/5 hover:scale-110"
        aria-label="Scroll right"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Carousel Container */}
      <div 
        ref={scrollRef}
        className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-8 pt-4 px-2 -mx-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {sortedTreatments.map((t) => {
          const startingPrice = getStartingPrice(t.pricing);
          return (
          <div 
            key={t.slug} 
            className="snap-start shrink-0 w-[85vw] sm:w-[320px] md:w-[350px] bg-white rounded-2xl shadow-sm ring-1 ring-gray-200/60 p-6 hover:shadow-xl transition-all duration-300 flex flex-col group/card relative hover:-translate-y-1"
          >
            <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover/card:text-blue-600 transition-colors line-clamp-2">{t.name}</h3>
            <p className="text-sm text-gray-600 mb-8 flex-1 leading-relaxed line-clamp-3">{t.shortDescription}</p>
            
            <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-gray-900">{startingPrice || 'Consultation'}</span>
                {startingPrice && <span className="text-xs text-gray-500 font-medium tracking-wide">Onwards</span>}
              </div>
              <Link 
                href={'/treatments/' + t.slug} 
                className="inline-flex items-center text-sm font-semibold text-blue-600 before:absolute before:inset-0"
              >
                View <ArrowRight className="ml-1 w-4 h-4 transition-transform group-hover/card:translate-x-1" />
              </Link>
            </div>
          </div>
        )})}
      </div>
      
      {/* Edge Gradients for visual cue */}
      <div className="absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-gray-50 to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none" />
    </div>
  )
}
