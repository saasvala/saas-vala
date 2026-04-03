import { Navigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';

const SAFE_PARAM = /^[a-zA-Z0-9_-]+$/;

export function hasInvalidRouteParam(params: Array<string | undefined>) {
  return params.some((param) => !!param && !SAFE_PARAM.test(param));
}

export function ParamValidatorGuard({ children, paramKeys, fallback = '/dashboard' }: { children: ReactNode; paramKeys: string[]; fallback?: string }) {
  const params = useParams();
  const values = paramKeys.map((key) => params[key]);
  if (hasInvalidRouteParam(values)) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
