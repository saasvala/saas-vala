import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { productsApi } from '@/lib/api';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { subscribeQuickActionEvents } from '@/lib/quickActionEvents';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  status: 'active' | 'suspended' | 'archived' | 'draft';
  price: number;
  currency: string;
  version: string;
  features: Json;
  created_at: string;
  updated_at: string;
  git_repo_url: string | null;
  git_repo_name: string | null;
  git_default_branch: string | null;
  deploy_status: string | null;
  marketplace_visible: boolean | null;
  demo_url: string | null;
  live_url: string | null;
  thumbnail_url: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  level: 'master' | 'sub' | 'micro' | 'nano';
  parent_id: string | null;
  description: string | null;
  is_active: boolean;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await productsApi.list();
      setProducts((res.data || []) as Product[]);
    } catch (e: any) {
      try {
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setProducts((data || []) as Product[]);
      } catch (fallbackError) {
        toast.error('Failed to fetch products');
        console.error(e);
        console.error(fallbackError);
      }
    }
    setLoading(false);
  };

  const fetchCategories = async () => {
    try {
      const res = await productsApi.categories();
      setCategories((res.data || []) as Category[]);
    } catch (e) {
      try {
        const { data } = await supabase
          .from('categories')
          .select('id, name, slug, level, parent_id, description, is_active')
          .order('name', { ascending: true });
        setCategories((data || []) as Category[]);
      } catch (fallbackError) {
        console.error(e);
        console.error(fallbackError);
      }
    }
  };

  const createProduct = async (product: Partial<Product>) => {
    try {
      const res = await productsApi.create(product);
      toast.success('Product created');
      await fetchProducts();
      return res.data;
    } catch (e: any) {
      const { data, error } = await supabase.from('products').insert(product as Record<string, unknown>).select().single();
      if (error) {
        toast.error('Failed to create product');
        throw e;
      }
      toast.success('Product created');
      await fetchProducts();
      return data;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      await productsApi.update(id, updates);
      toast.success('Product updated');
      await fetchProducts();
    } catch (e: any) {
      const { error } = await supabase
        .from('products')
        .update(updates as Record<string, unknown>)
        .eq('id', id);
      if (error) {
        toast.error('Failed to update product');
        throw e;
      }
      toast.success('Product updated');
      await fetchProducts();
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await productsApi.delete(id);
      toast.success('Product deleted');
      await fetchProducts();
    } catch (e: any) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) {
        toast.error('Failed to delete product');
        throw e;
      }
      toast.success('Product deleted');
      await fetchProducts();
    }
  };

  const suspendProduct = async (id: string) => {
    await updateProduct(id, { status: 'suspended' });
  };

  const activateProduct = async (id: string) => {
    await updateProduct(id, { status: 'active' });
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('products-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
      })
      .subscribe();

    const unsubscribeQuickEvents = subscribeQuickActionEvents((event) => {
      if (event === 'product_added' || event === 'apk_uploaded') {
        fetchProducts();
      }
    });

    return () => {
      unsubscribeQuickEvents();
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    products,
    categories,
    loading,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    suspendProduct,
    activateProduct
  };
}
