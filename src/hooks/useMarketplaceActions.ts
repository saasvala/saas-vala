import { useCallback, useEffect, useMemo, useState } from 'react';
import { marketplaceApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export function useMarketplaceActions() {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [cartQtyByProduct, setCartQtyByProduct] = useState<Record<string, number>>({});

  const refreshFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    const res: any = await marketplaceApi.favoriteList();
    const rows = Array.isArray(res?.data) ? res.data : [];
    const next = new Set<string>();
    rows.forEach((row: any) => {
      if (row?.product_id) next.add(String(row.product_id));
    });
    setFavoriteIds(next);
  }, [user]);

  const refreshCart = useCallback(async () => {
    if (!user) {
      setCartQtyByProduct({});
      return;
    }
    const res: any = await marketplaceApi.cartList();
    const rows = Array.isArray(res?.data) ? res.data : [];
    const next: Record<string, number> = {};
    rows.forEach((row: any) => {
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
    const res: any = await marketplaceApi.favoriteToggle(productId, productName);
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
    const res: any = await marketplaceApi.cartAdd(productId, qty);
    const nextQty = Math.max(1, Number(res?.qty || qty));
    setCartQtyByProduct((prev) => ({ ...prev, [productId]: nextQty }));
    return {
      qty: nextQty,
      cartCount: Math.max(0, Number(res?.cart_count || 0)),
    };
  }, []);

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
