import { MetadataRoute } from 'next'
import { siteConfig } from '@/config/site'
import { getTreatments } from '@/lib/data/price-list'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const treatments = await getTreatments()
  const baseUrl = siteConfig.url

  const routes = [
    '',
    '/book',
    '/treatments',
    '/privacy',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }))

  const treatmentRoutes = treatments.map((t) => ({
    url: `${baseUrl}/treatments/${t.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.9,
  }))

  return [...routes, ...treatmentRoutes]
}
