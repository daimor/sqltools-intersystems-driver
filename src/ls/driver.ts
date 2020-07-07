import AbstractDriver from '@sqltools/base-driver';
import queries from './queries';
import { IConnectionDriver, MConnectionExplorer, NSDatabase, ContextValue, Arg0 } from '@sqltools/types';
import { v4 as generateId } from 'uuid';
import IRISdb, { IRISDirect, IQueries } from './irisdb';
import keywordsCompletion from './keywords';
// import { workspace } from "vscode";

type DriverOptions = any;
export default class IRISDriver extends AbstractDriver<IRISdb, DriverOptions> implements IConnectionDriver {

  queries: IQueries = queries;

  public async open() {
    if (this.connection) {
      return this.connection;
    }

    const { namespace } = this.credentials;
    let config: IRISDirect;
    if (this.credentials.serverName) {
      // const serverName = this.credentials.serverName;
      // const server = workspace.getConfiguration(`intersystems.servers.${serverName}.webServer`);
      // let { scheme, host, port, pathPrefix, username, password } = server;
      // config = {
      //   https: scheme === "https",
      //   host,
      //   port,
      //   pathPrefix,
      //   namespace,
      //   username,
      //   password
      // };
    } else {
      let { https, server: host, port, pathPrefix, username, password } = this.credentials;
      config = {
        https,
        host,
        port,
        pathPrefix,
        namespace,
        username,
        password
      };
    }

    const irisdb = new IRISdb(config);
    return irisdb.open()
      .then(() => {
        this.connection = Promise.resolve(irisdb);
        return this.connection;
      });
  }

  public async close() {
    if (!this.connection) return Promise.resolve();

    await (await this.connection).close();
    this.connection = null;
  }

  public query: (typeof AbstractDriver)['prototype']['query'] = async (queries, opt = {}) => {
    const irisdb = await this.open();
    console.log("Queries: ", typeof queries);
    const queriesResults = [await irisdb.query(queries.toString(), [])];
    const resultsAgg: NSDatabase.IResult[] = [];
    queriesResults.forEach(queryResult => {
      resultsAgg.push({
        cols: queryResult.length ? Object.keys(queryResult[0]) : [],
        connId: this.getId(),
        messages: [{ date: new Date(), message: `Query ok with ${queryResult.length} results` }],
        results: queryResult,
        query: queries.toString(),
        requestId: opt.requestId,
        resultId: generateId(),
      });
    });

    return resultsAgg;
  }

  /** if you need a different way to test your connection, you can set it here.
   * Otherwise by default we open and close the connection only
   */
  public async testConnection() {
    await this.open();
    await this.query('SELECT 1', {});
  }

  /**
   * This method is a helper to generate the connection explorer tree.
   * it gets the child items based on current item
   */
  public async getChildrenForItem({ item, parent }: Arg0<IConnectionDriver['getChildrenForItem']>) {
    switch (item.type) {
      case ContextValue.CONNECTION:
      case ContextValue.CONNECTED_CONNECTION:
        return <MConnectionExplorer.IChildItem[]>[
          { label: 'Tables', type: ContextValue.RESOURCE_GROUP, iconId: 'folder', childType: ContextValue.TABLE },
          { label: 'Views', type: ContextValue.RESOURCE_GROUP, iconId: 'folder', childType: ContextValue.VIEW },
          { label: 'Procedures', type: ContextValue.RESOURCE_GROUP, iconId: 'folder', childType: ContextValue.FUNCTION },
        ];
      case ContextValue.RESOURCE_GROUP:
        return this.getSchemas({ item, parent });
      case ContextValue.SCHEMA:
        return this.getChildrenForSchema({ item, parent });
      case ContextValue.TABLE:
      case ContextValue.VIEW:
        return this.getColumns(item as NSDatabase.ITable);
    }
    return [];
  }

  private async getSchemas({ item }: Arg0<IConnectionDriver['getChildrenForItem']>) {
    switch (item.childType) {
      case ContextValue.TABLE:
        return this.queryResults(this.queries.fetchTableSchemas());
      case ContextValue.VIEW:
        return this.queryResults(this.queries.fetchViewSchemas());
      case ContextValue.FUNCTION:
        return this.queryResults(this.queries.fetchFunctionSchemas());
    }
    return [];
  }

  private async getChildrenForSchema({ item }: Arg0<IConnectionDriver['getChildrenForItem']>) {
    switch (item.childType) {
      case ContextValue.TABLE:
        return this.queryResults(this.queries.fetchTables(item as NSDatabase.ISchema));
      case ContextValue.VIEW:
        return this.queryResults(this.queries.fetchViews(item as NSDatabase.ISchema));
      case ContextValue.FUNCTION:
        return this.queryResults(this.queries.fetchFunctions(item as NSDatabase.ISchema));
    }
    return [];
  }

  /**
   * This method is a helper for intellisense and quick picks.
   */
  public async searchItems(itemType: ContextValue, _search: string, _extraParams: any = {}): Promise<NSDatabase.SearchableItem[]> {
    switch (itemType) {
      case ContextValue.TABLE:
      case ContextValue.VIEW:
        return []
      case ContextValue.COLUMN:
        return [];
    }
    return [];
  }

  private async getColumns(parent: NSDatabase.ITable): Promise<NSDatabase.IColumn[]> {
    const results = await this.queryResults(this.queries.fetchColumns(parent));
    return results.map(col => ({
      ...col,
      iconName: col.isPk ? 'pk' : (col.isFk ? 'fk' : null),
      childType: ContextValue.NO_CHILD,
      table: parent
    }));
  }

  public getStaticCompletions: IConnectionDriver['getStaticCompletions'] = async () => {
    return keywordsCompletion;
  }
}
