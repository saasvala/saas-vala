import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  User,
  Globe,
  ChevronDown,
  LogIn,
  Users,
  Search,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import saasValaLogo from '@/assets/saas-vala-logo.jpg';
import { AVAILABLE_CURRENCIES, AVAILABLE_LANGUAGES, DEFAULT_LOCALE, getStoredLocale, storeLocale } from '@/lib/locale';

export function MarketplaceHeader() {
  const navigate = useNavigate();
  const { user, isReseller } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    const stored = getStoredLocale()
    return AVAILABLE_CURRENCIES.find((c) => c.code === stored.currency) || AVAILABLE_CURRENCIES[0]
  });
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const stored = getStoredLocale()
    return AVAILABLE_LANGUAGES.find((l) => l.code === stored.language) || AVAILABLE_LANGUAGES[0]
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    const onLocaleChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ currency?: string; language?: string }>).detail || {}
      const nextCurrency = AVAILABLE_CURRENCIES.find((c) => c.code === detail.currency)
      const nextLanguage = AVAILABLE_LANGUAGES.find((l) => l.code === detail.language)
      if (nextCurrency) setSelectedCurrency(nextCurrency)
      if (nextLanguage) setSelectedLanguage(nextLanguage)
    }
    window.addEventListener('global-locale-changed', onLocaleChanged as EventListener)
    return () => window.removeEventListener('global-locale-changed', onLocaleChanged as EventListener)
  }, [])

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Scroll to products and filter — dispatch custom event
      window.dispatchEvent(new CustomEvent('marketplace-search', { detail: searchQuery.trim() }));
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background/90 backdrop-blur-xl border-border">
      <div className="h-full px-4 md:px-8 flex items-center justify-between gap-2">
        {/* Logo */}
        <div
          className="flex items-center gap-3 cursor-pointer shrink-0"
          onClick={() => {
            navigate('/');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <img
            src={saasValaLogo}
            alt="SaaS VALA"
            className="h-10 w-10 rounded-xl object-cover border border-primary/20"
          />
          <span className="font-display font-bold text-lg text-foreground hidden sm:block">
            SaaS VALA
          </span>
        </div>

        {/* Center — Search Bar (expandable) */}
        <div className="flex-1 max-w-md mx-2 hidden md:flex">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search 2000+ software products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 pr-3 h-9 text-sm bg-muted/50 border-border/50 focus:bg-background"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); window.dispatchEvent(new CustomEvent('marketplace-search', { detail: '' })); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile search toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Renew / Recharge */}
          {user && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => navigate('/wallet')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Renew</span>
            </Button>
          )}

          {/* Currency Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-2 text-xs">
                <span>{selectedCurrency.flag}</span>
                <span className="hidden sm:inline font-medium">{selectedCurrency.code}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              {AVAILABLE_CURRENCIES.map((c) => (
                <DropdownMenuItem
                  key={c.code}
                  className="gap-2 text-sm"
                  onClick={() => {
                    setSelectedCurrency(c)
                    storeLocale({
                      currency: c.code,
                      language: selectedLanguage?.code || DEFAULT_LOCALE.language,
                    })
                  }}
                >
                  <span>{c.flag}</span>
                  <span>{c.symbol} {c.code}</span>
                  {c.code === selectedCurrency.code && (
                    <span className="ml-auto text-primary" role="img" aria-label="Selected">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Language Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 px-2">
                <Globe className="h-4 w-4" />
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {AVAILABLE_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  className="gap-2"
                  onClick={() => {
                    setSelectedLanguage(lang)
                    storeLocale({
                      language: lang.code,
                      currency: selectedCurrency?.code || DEFAULT_LOCALE.currency,
                    })
                  }}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                  {lang.code === selectedLanguage.code && (
                    <span className="ml-auto text-primary" role="img" aria-label="Selected">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Apply for Reseller */}
          {!isReseller && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hidden sm:flex"
              onClick={() => navigate(user ? '/auth?apply=reseller' : '/auth?apply=reseller')}
            >
              <Users className="h-4 w-4" />
              <span className="hidden lg:inline">Apply Reseller</span>
            </Button>
          )}

          {/* Reseller Panel */}
          {isReseller && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-secondary/30 text-secondary hover:bg-secondary/10"
              onClick={() => navigate('/reseller-dashboard')}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Reseller</span>
            </Button>
          )}

          {/* Auth */}
          {user ? (
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="h-9 w-9">
              <User className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/auth')}
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Login</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="md:hidden px-4 pb-3 bg-background border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>
      )}
    </header>
  );
}
