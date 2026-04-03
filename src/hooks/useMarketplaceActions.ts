import { useCallback, useEffect, useMemo, useState } from 'react';
import { marketplaceApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

type FavoriteRow = {
  id: string;
  product_id: string;
  product_name?: string;
  created_at?: string;
};

type CartRow = {
  id: string;
  product_id: string;
  qty: number;
  created_at?: string;
  updated_at?: string;
};

type FavoriteListResponse = { data?: FavoriteRow[] };
type CartListResponse = { data?: CartRow[] };
type FavoriteToggleResponse = { active?: boolean };
type CartAddResponse = { qty?: number; cart_count?: number };

export function useMarketplaceActions() {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});

  const refreshFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    const res = await marketplaceApi.favoriteList() as FavoriteListResponse;
    const rows = Array.isArray(res?.data) ? res.data : [];
    const next = new Set<string>();
    rows.forEach((row) => {
      if (row?.product_id) next.add(String(row.product_id));
    });
    setFavoriteIds(next);
  }, [user]);

  const refreshCart = useCallback(async () => {
    if (!user) {
      setCartQtyByProduct({});
      return;
    }
    const res = await marketplaceApi.cartList() as CartListResponse;
    const rows = Array.isArray(res?.data) ? res.data : [];
    const next: Record<string, number> = {};
    rows.forEach((row) => {
      if (!row?.product_id) return;
      next[String(row.product_id)] = Math.max(1, Number(row.qty || 1));
    });
    setCartQtyByProduct(next);
  }, [user]);

  useEffect(() => {
    void refreshFavorites();
    void refreshCart();
  }, [refreshFavorites, refreshCart]);

  const toggleFavorite = useCallback(async (productId: string, productName?: string) => {
    const res = await marketplaceApi.favoriteToggle(productId, productName) as FavoriteToggleResponse;
    if (!res) throw new Error('Favorite response missing');
    const active = Boolean(res?.active);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (active) next.add(productId);
      else next.delete(productId);
      return next;
    });
    return active;
  }, []);

  const addToCart = useCallback(async (productId: string, qty = 1) => {
    const res = await marketplaceApi.cartAdd(productId, qty) as CartAddResponse;
    if (!res) throw new Error('Cart response missing');
    const nextQty = Math.max(1, Number(res?.qty || qty));
    setCartQtyByProduct((prev) => ({ ...prev, [productId]: nextQty }));
    void refreshCart();
    return {
      qty: nextQty,
      cartCount: Math.max(0, Number(res?.cart_count || 0)),
    };
  }, [refreshCart]);

  const addRating = useCallback(async (productId: string, rating: number, productTitle?: string, review?: string) => {
    return marketplaceApi.ratingAdd({
      product_id: productId,
      rating,
      product_title: productTitle,
      review,
    });
  }, []);

  const addComment = useCallback(async (productId: string, message: string) => {
    return marketplaceApi.commentAdd({ product_id: productId, message });
  }, []);

  const listComments = useCallback(async (productId: string) => {
    return marketplaceApi.commentList(productId);
  }, []);

  const createPromo = useCallback(async (productId: string) => {
    return marketplaceApi.promoCreate(productId);
  }, []);

  const trackPromoClick = useCallback(async (code: string) => {
    return marketplaceApi.promoTrackClick(code);
  }, []);

  const trackPromoConversion = useCallback(async (code: string, amount: number) => {
    return marketplaceApi.promoTrackConversion(code, amount);
  }, []);

  const isFavorited = useCallback((productId: string) => favoriteIds.has(productId), [favoriteIds]);
  const cartCount = useMemo(
    () => Object.values(cartQtyByProduct).reduce((sum, qty) => sum + Math.max(0, Number(qty || 0)), 0),
    [cartQtyByProduct]
  );

  return {
    isFavorited,
    favoriteIds,
    toggleFavorite,
    cartQtyByProduct,
    cartCount,
    addToCart,
    addRating,
    addComment,
    listComments,
    createPromo,
    trackPromoClick,
    trackPromoConversion,
    refreshFavorites,
    refreshCart,
  };
}
