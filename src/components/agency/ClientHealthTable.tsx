// src/components/agency/ClientHealthTable.tsx
// Enhanced client health table with search, task modals, and polish

'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, CheckCircle2, Circle, ListTodo } from 'lucide-react';
import type { ClientWithHealth } from '@/types/database';
import { TrafficLight } from './TrafficLight';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ClientHealthTableProps {
  clients: ClientWithHealth[];
  onClientClick: (clientId: string) => void;
}

interface ClientTask {
  id: string;
  title: string;
  taskType: 'setup' | 'health_check';
  dueDate: string | null;
  nextDueDate: string | null;
  completed: boolean;
  isOverdue: boolean;
  isAtRisk: boolean;
}

type SortKey = 'name' | 'status' | 'channels' | 'overdue' | 'budget';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'red' | 'red-amber' | 'green';

export function ClientHealthTable({ clients, onClientClick }: ClientHealthTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithHealth | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);

  // Filter by search query
  const searchedClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter((c) =>
      c.name.toLowerCase().includes(query)
    );
  }, [clients, searchQuery]);

  // Filter by status
  const filteredClients = useMemo(() => {
    if (filter === 'all') return searchedClients;
    if (filter === 'red') {
      return searchedClients.filter((c) => c.health?.status === 'red');
    }
    if (filter === 'red-amber') {
      return searchedClients.filter(
        (c) => c.health?.status === 'red' || c.health?.status === 'amber'
      );
    }
    if (filter === 'green') {
      return searchedClients.filter((c) => c.health?.status === 'green');
    }
    return searchedClients;
  }, [searchedClients, filter]);

  // Sort clients
  const sortedClients = useMemo(() => {
    const sorted = [...filteredClients];

    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortKey) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          const statusOrder = { red: 0, amber: 1, green: 2 };
          aValue = statusOrder[a.health?.status || 'green'];
          bValue = statusOrder[b.health?.status || 'green'];
          break;
        case 'channels':
          aValue = a.health?.active_channel_count || 0;
          bValue = b.health?.active_channel_count || 0;
          break;
        case 'overdue':
          aValue = a.health?.total_overdue_tasks || 0;
          bValue = b.health?.total_overdue_tasks || 0;
          break;
        case 'budget':
          aValue = a.health?.budget_health_percentage || 0;
          bValue = b.health?.budget_health_percentage || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredClients, sortKey, sortDirection]);

  // Handle sort
  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }, [sortKey]);

  // Handle client click
  const handleClientClick = useCallback((clientId: string) => {
    onClientClick(clientId);
    router.push(`/clients/${clientId}/dashboard-v2`);
  }, [onClientClick, router]);

  // Load client tasks
  const loadClientTasks = useCallback(async (clientId: string) => {
    setLoadingTasks(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/health`);
      if (res.ok) {
        const data = await res.json();
        setClientTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      setClientTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  // Open task dialog
  const openTaskDialog = useCallback((client: ClientWithHealth, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClient(client);
    setTaskDialogOpen(true);
    loadClientTasks(client.id);
  }, [loadClientTasks]);

  // Toggle task completion
  const toggleTaskComplete = useCallback(async (taskId: string, completed: boolean) => {
    // TODO: Implement task completion API
    console.log('Toggle task:', taskId, completed);
    // For now, just update UI optimistically
    setClientTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, completed: !completed } : task
      )
    );
  }, []);

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Render sort icon
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  // Calculate filter counts
  const filterCounts = useMemo(() => ({
    all: searchedClients.length,
    red: searchedClients.filter((c) => c.health?.status === 'red').length,
    redAmber: searchedClients.filter(
      (c) => c.health?.status === 'red' || c.health?.status === 'amber'
    ).length,
    green: searchedClients.filter((c) => c.health?.status === 'green').length,
  }), [searchedClients]);

  // Empty state
  if (sortedClients.length === 0 && !searchQuery) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
            className="h-11"
          >
            All ({clients.length})
          </Button>
          <Button
            variant={filter === 'red' ? 'default' : 'outline'}
            onClick={() => setFilter('red')}
            size="sm"
            className="h-11"
          >
            🔴 Red ({filterCounts.red})
          </Button>
          <Button
            variant={filter === 'red-amber' ? 'default' : 'outline'}
            onClick={() => setFilter('red-amber')}
            size="sm"
            className="h-11"
          >
            🔴 🟠 At Risk ({filterCounts.redAmber})
          </Button>
          <Button
            variant={filter === 'green' ? 'default' : 'outline'}
            onClick={() => setFilter('green')}
            size="sm"
            className="h-11"
          >
            🟢 Green ({filterCounts.green})
          </Button>
        </div>

        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg font-medium text-muted-foreground">
              No clients found
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {filter !== 'all'
                ? 'Try adjusting your filter'
                : 'Create your first client to get started'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
            aria-label="Search clients by name"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            size="sm"
            className="h-11"
            aria-label={`Show all clients (${filterCounts.all})`}
          >
            All ({filterCounts.all})
          </Button>
          <Button
            variant={filter === 'red' ? 'default' : 'outline'}
            onClick={() => setFilter('red')}
            size="sm"
            className="h-11"
            aria-label={`Show critical clients (${filterCounts.red})`}
          >
            🔴 Red ({filterCounts.red})
          </Button>
          <Button
            variant={filter === 'red-amber' ? 'default' : 'outline'}
            onClick={() => setFilter('red-amber')}
            size="sm"
            className="h-11"
            aria-label={`Show at-risk clients (${filterCounts.redAmber})`}
          >
            🔴 🟠 At Risk ({filterCounts.redAmber})
          </Button>
          <Button
            variant={filter === 'green' ? 'default' : 'outline'}
            onClick={() => setFilter('green')}
            size="sm"
            className="h-11"
            aria-label={`Show healthy clients (${filterCounts.green})`}
          >
            🟢 Green ({filterCounts.green})
          </Button>
        </div>
      </div>

      {/* Empty search result */}
      {sortedClients.length === 0 && searchQuery && (
        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg font-medium text-muted-foreground">
              No clients match &quot;{searchQuery}&quot;
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="mt-4"
            >
              Clear search
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Desktop Table View */}
      {sortedClients.length > 0 && (
        <div className="hidden md:block border rounded-lg overflow-hidden animate-in slide-in-from-top-2 duration-300">
          <table className="w-full" role="table" aria-label="Client health status table">
            <thead className="bg-muted/50 border-b">
              <tr role="row">
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-2 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
                    aria-label="Sort by status"
                  >
                    Status
                    <SortIcon columnKey="status" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-2 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
                    aria-label="Sort by client name"
                  >
                    Client Name
                    <SortIcon columnKey="name" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">
                  <button
                    onClick={() => handleSort('channels')}
                    className="flex items-center gap-2 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
                    aria-label="Sort by channel count"
                  >
                    Channels
                    <SortIcon columnKey="channels" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">
                  <button
                    onClick={() => handleSort('overdue')}
                    className="flex items-center gap-2 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
                    aria-label="Sort by overdue tasks"
                  >
                    Overdue
                    <SortIcon columnKey="overdue" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">At Risk</th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">
                  <button
                    onClick={() => handleSort('budget')}
                    className="flex items-center gap-2 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring rounded-sm"
                    aria-label="Sort by budget status"
                  >
                    Budget
                    <SortIcon columnKey="budget" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedClients.map((client, index) => (
                <tr
                  key={client.id}
                  onClick={() => handleClientClick(client.id)}
                  className="border-b hover:bg-muted/50 cursor-pointer transition-colors focus-within:bg-muted/50 animate-in fade-in slide-in-from-left-2 duration-300"
                  style={{ animationDelay: `${index * 30}ms` }}
                  role="row"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClientClick(client.id);
                    }
                  }}
                  aria-label={`Client: ${client.name}, Status: ${client.health?.status || 'unknown'}`}
                >
                  <td className="px-4 py-3" role="cell">
                    <TrafficLight
                      status={client.health?.status}
                      size="medium"
                    />
                  </td>
                  <td className="px-4 py-3" role="cell">
                    <span className="font-semibold">
                      {searchQuery ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: client.name.replace(
                              new RegExp(searchQuery, 'gi'),
                              (match) => `<mark class="bg-yellow-200">${match}</mark>`
                            ),
                          }}
                        />
                      ) : (
                        client.name
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3" role="cell">
                    <Badge variant="outline">
                      {client.health?.active_channel_count || 0}
                    </Badge>
                  </td>
                  <td className="px-4 py-3" role="cell">
                    {client.health?.total_overdue_tasks ? (
                      <Badge variant="destructive">
                        {client.health.total_overdue_tasks}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3" role="cell">
                    {client.health?.at_risk_tasks ? (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                        {client.health.at_risk_tasks}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3" role="cell">
                    {client.health?.budget_health_percentage !== null &&
                    client.health?.budget_health_percentage !== undefined ? (
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(
                            client.health.budget_health_percentage,
                            100
                          )}
                          className="h-2 w-20"
                          aria-label={`Budget: ${client.health.budget_health_percentage.toFixed(0)}%`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {client.health.budget_health_percentage.toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3" role="cell">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-2"
                      onClick={(e) => openTaskDialog(client, e)}
                      aria-label={`View tasks for ${client.name}`}
                    >
                      <ListTodo className="h-4 w-4" />
                      Tasks
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Card View */}
      {sortedClients.length > 0 && (
        <div className="md:hidden space-y-4">
          {sortedClients.map((client, index) => (
            <Card
              key={client.id}
              className="cursor-pointer hover:shadow-md transition-shadow animate-in fade-in slide-in-from-bottom-2 duration-300"
              style={{ animationDelay: `${index * 30}ms` }}
              onClick={() => handleClientClick(client.id)}
              role="article"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClientClick(client.id);
                }
              }}
              aria-label={`Client: ${client.name}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TrafficLight status={client.health?.status} size="medium" />
                    <CardTitle className="text-lg">{client.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Channels</p>
                    <p className="font-semibold">
                      {client.health?.active_channel_count || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Overdue</p>
                    <p
                      className={cn(
                        'font-semibold',
                        client.health?.total_overdue_tasks
                          ? 'text-red-600'
                          : 'text-muted-foreground'
                      )}
                    >
                      {client.health?.total_overdue_tasks || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">At Risk</p>
                    <p
                      className={cn(
                        'font-semibold',
                        client.health?.at_risk_tasks
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                      )}
                    >
                      {client.health?.at_risk_tasks || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Budget</p>
                    <p className="font-semibold">
                      {client.health?.budget_health_percentage?.toFixed(0) || 0}%
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  size="default"
                  onClick={(e) => openTaskDialog(client, e)}
                  aria-label={`View tasks for ${client.name}`}
                >
                  <ListTodo className="h-4 w-4 mr-2" />
                  View Tasks
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedClient && (
                <>
                  <TrafficLight
                    status={selectedClient.health?.status}
                    size="medium"
                  />
                  {selectedClient.name} - Tasks
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              View and manage tasks for this client
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {loadingTasks ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-muted animate-pulse rounded"
                  />
                ))}
              </div>
            ) : clientTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tasks found for this client
              </div>
            ) : (
              <>
                {/* Overdue Tasks */}
                {clientTasks.filter((t) => t.isOverdue).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-red-600 mb-2">
                      Overdue ({clientTasks.filter((t) => t.isOverdue).length})
                    </h4>
                    <div className="space-y-2">
                      {clientTasks
                        .filter((t) => t.isOverdue)
                        .map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            onToggle={toggleTaskComplete}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* At Risk Tasks */}
                {clientTasks.filter((t) => t.isAtRisk && !t.completed).length >
                  0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-amber-600 mb-2">
                      At Risk (
                      {clientTasks.filter((t) => t.isAtRisk && !t.completed).length}
                      )
                    </h4>
                    <div className="space-y-2">
                      {clientTasks
                        .filter((t) => t.isAtRisk && !t.completed)
                        .map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            onToggle={toggleTaskComplete}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Tasks */}
                {clientTasks.filter(
                  (t) => !t.isOverdue && !t.isAtRisk && !t.completed
                ).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-2">
                      Upcoming (
                      {
                        clientTasks.filter(
                          (t) => !t.isOverdue && !t.isAtRisk && !t.completed
                        ).length
                      }
                      )
                    </h4>
                    <div className="space-y-2">
                      {clientTasks
                        .filter((t) => !t.isOverdue && !t.isAtRisk && !t.completed)
                        .map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            onToggle={toggleTaskComplete}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Completed Tasks */}
                {clientTasks.filter((t) => t.completed).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-green-600 mb-2">
                      Completed ({clientTasks.filter((t) => t.completed).length})
                    </h4>
                    <div className="space-y-2">
                      {clientTasks
                        .filter((t) => t.completed)
                        .map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            onToggle={toggleTaskComplete}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Task Item Component
function TaskItem({
  task,
  onToggle,
}: {
  task: ClientTask;
  onToggle: (id: string, completed: boolean) => void;
}) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const dueDate = task.dueDate || task.nextDueDate;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        task.completed ? 'bg-muted/50' : 'bg-background hover:bg-muted/30'
      )}
    >
      <button
        onClick={() => onToggle(task.id, task.completed)}
        className="mt-0.5 focus:outline-none focus:ring-2 focus:ring-ring rounded"
        aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {task.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium text-sm',
            task.completed && 'line-through text-muted-foreground'
          )}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className="text-xs"
          >
            {task.taskType === 'setup' ? 'Setup' : 'Health Check'}
          </Badge>
          {dueDate && (
            <span className={cn(task.isOverdue && 'text-red-600 font-semibold')}>
              Due: {formatDate(dueDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
