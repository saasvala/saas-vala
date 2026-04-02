import { useMemo, useState } from 'react';
import { MaskedField } from '@/components/ui/masked-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Search,
  Key,
  Calendar,
  Mail,
  Phone,
} from 'lucide-react';
import { useResellerClients } from '@/hooks/useResellerClients';

export function ClientsPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const { clients, stats, loading } = useResellerClients();

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => {
      const hay = `${client.name} ${client.email || ''} ${client.phone || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [clients, searchQuery]);

  const totalClients = stats.total_clients ?? clients.length;
  const activeClients = stats.active_clients ?? clients.filter((client) => client.status === 'active').length;
  const totalKeys = stats.total_keys ?? clients.reduce((sum, client) => sum + Number(client.keys || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-xl font-bold text-foreground">{totalClients}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-xl font-bold text-foreground">{activeClients}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <Key className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Keys Sold</p>
                <p className="text-xl font-bold text-foreground">{totalKeys}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                My Clients
              </CardTitle>
              <CardDescription>
                View and track your client purchases
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-center">Keys</TableHead>
                  <TableHead>Last Purchase</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="font-medium text-foreground">{client.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {client.email && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <MaskedField value={client.email} type="email" />
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            <MaskedField value={client.phone} type="phone" />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold text-foreground">{client.keys}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {client.last_purchase ? new Date(client.last_purchase).toLocaleDateString() : '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={client.status === 'active'
                          ? 'bg-green-500/20 text-green-500 border-green-500/30'
                          : 'bg-muted text-muted-foreground border-muted-foreground/30'}
                      >
                        {client.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!loading && filteredClients.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No clients found matching your search.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
