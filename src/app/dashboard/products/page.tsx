import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProductsTable } from '@/components/products/ProductsTable';
import { Package, Download } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Products' };

interface SearchParams { page?: string; search?: string; category?: string; retailer?: string; }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const orgId   = session!.user.orgId;
  const sp      = await searchParams;

  const page     = Number(sp.page ?? 1);
  const pageSize = 25;
  const search   = sp.search?.trim();
  const category = sp.category;
  const retailer = sp.retailer;

  const where: any = {
    orgId,
    ...(search   ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { asin: { contains: search } }] } : {}),
    ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
    ...(retailer ? { sourceRetailer: { equals: retailer, mode: 'insensitive' } } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { score: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-[1800px]">
      <div className="page-header mb-5">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">{total.toLocaleString()} discovered products in your pipeline</p>
        </div>
        <Link href="/api/export?type=products&format=csv" className="btn-secondary text-xs">
          <Download className="w-3.5 h-3.5" />Export CSV
        </Link>
      </div>

      <ProductsTable products={products as any} total={total} page={page} pageSize={pageSize} />
    </div>
  );
}
