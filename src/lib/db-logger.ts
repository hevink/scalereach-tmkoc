import { performance } from 'perf_hooks';

export interface QueryLog {
  query: string;
  params?: any[];
  duration: number;
  timestamp: Date;
  operation: string;
  table?: string;
  error?: string;
}

export class DatabaseLogger {
  private static logs: QueryLog[] = [];
  private static maxLogs = 1000; // Keep last 1000 queries

  static log(queryLog: QueryLog) {
    // Add to in-memory logs
    this.logs.push(queryLog);
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console log with formatting
    const logLevel = queryLog.error ? 'error' : 'info';
    const logMessage = this.formatLogMessage(queryLog);
    
    if (queryLog.error) {
      console.error(`[DB ERROR] ${logMessage}`);
    } else {
      console.log(`[DB QUERY] ${logMessage}`);
    }
  }

  private static formatLogMessage(queryLog: QueryLog): string {
    const { query, params, duration, operation, table, error } = queryLog;
    
    let message = `${operation.toUpperCase()}`;
    if (table) {
      message += ` on ${table}`;
    }
    message += ` (${duration.toFixed(2)}ms)`;
    
    if (error) {
      message += ` - ERROR: ${error}`;
    }
    
    message += `\n  Query: ${query}`;
    
    if (params && params.length > 0) {
      message += `\n  Params: ${JSON.stringify(params)}`;
    }
    
    return message;
  }

  static getLogs(): QueryLog[] {
    return [...this.logs];
  }

  static getRecentLogs(count: number = 10): QueryLog[] {
    return this.logs.slice(-count);
  }

  static clearLogs(): void {
    this.logs = [];
  }

  static getLogStats() {
    const totalQueries = this.logs.length;
    const avgDuration = totalQueries > 0 
      ? this.logs.reduce((sum, log) => sum + log.duration, 0) / totalQueries 
      : 0;
    
    const operationCounts = this.logs.reduce((acc, log) => {
      acc[log.operation] = (acc[log.operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorCount = this.logs.filter(log => log.error).length;

    return {
      totalQueries,
      avgDuration: Number(avgDuration.toFixed(2)),
      operationCounts,
      errorCount,
      successRate: totalQueries > 0 ? ((totalQueries - errorCount) / totalQueries * 100).toFixed(2) : '100.00'
    };
  }
}

// Helper function to extract table name from query
export function extractTableName(query: string): string | undefined {
  const patterns = [
    /(?:from|into|update|delete from)\s+["']?(\w+)["']?/i,
    /insert\s+into\s+["']?(\w+)["']?/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

// Helper function to determine operation type from query
export function extractOperation(query: string): string {
  const trimmedQuery = query.trim().toLowerCase();
  
  if (trimmedQuery.startsWith('select')) return 'SELECT';
  if (trimmedQuery.startsWith('insert')) return 'INSERT';
  if (trimmedQuery.startsWith('update')) return 'UPDATE';
  if (trimmedQuery.startsWith('delete')) return 'DELETE';
  if (trimmedQuery.startsWith('create')) return 'CREATE';
  if (trimmedQuery.startsWith('drop')) return 'DROP';
  if (trimmedQuery.startsWith('alter')) return 'ALTER';
  
  return 'UNKNOWN';
}