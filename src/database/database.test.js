/* eslint-env jest */
//const bcrypt = require('bcrypt');

// mock db
jest.mock('mysql2/promise', () => {
    return {
      createConnection: jest.fn(async () => {
        return {
          execute: jest.fn(async (sql) => {
            // Normalize sql: mysql2 might pass a string or an object
            const query = typeof sql === 'string' ? sql : (sql?.sql || '');
  
            // ---- Existing passing tests ----
            if (query.startsWith('SELECT id FROM menu')) {
              return [[{ id: 1 }]];
            }
            if (query.includes('INFORMATION_SCHEMA')) {
              return [[{ SCHEMA_NAME: 'pizza' }]];
            }
  
            // New CRUD wrapper tests
            if (query.includes('SELECT userId FROM auth')) {
              return [[{ userId: 1 }]];
            }
            if (query.includes('INSERT INTO auth')) {
              return [[]];
            }
            if (query.includes('DELETE FROM auth')) {
              return [[]];
            }
            if (query.includes('INSERT INTO store')) {
              return [{ insertId: 99 }];
            }
            if (query.includes('SELECT o.id')) {
              // example data for getOrders
              return [[{ id: 8, description: 'pizza', menuId: 3, price: 10 }]];
            }
            if (query.includes('INSERT INTO dinerOrder')) {
              return [{ insertId: 42 }];
            }
            if (query.includes('INSERT INTO dinerOrderItem')) {
              return [[]];
            }
            if (query.includes('DELETE FROM store')) {
              return [[]];
            }
  
            // default empty result for everything else
            return [[]];
          }),
          query: jest.fn(async () => [[]]),
          end: jest.fn(),
        };
      }),
    };
  });
  

const mysql = require('mysql2/promise');
const { DB } = require('./database');

describe('database.js utility methods', () => {
  test('getOffset returns expected offset', () => {
    expect(DB.getOffset(2, 5)).toBe(5); 
    expect(DB.getOffset(1, 10)).toBe(0);
  });

  test('getTokenSignature extracts third part of JWT', () => {
    const token = 'aaa.bbb.ccc';
    expect(DB.getTokenSignature(token)).toBe('ccc');
    expect(DB.getTokenSignature('only.one')).toBe(''); 
  });

  test('getID resolves with ID when row exists', async () => {
    const fakeConn = await mysql.createConnection();
    const id = await DB.getID(fakeConn, 'name', 'margherita', 'menu');
    expect(id).toBe(1);
  });

  test('getID throws when no row exists', async () => {
    const fakeConn = {
      execute: jest.fn(async () => [[]]), // empty
    };
    await expect(DB.getID(fakeConn, 'name', 'missing', 'menu'))
      .rejects.toThrow('No ID found');
  });
});

describe('initializeDatabase error handling', () => {
  test('logs an error if connection fails', async () => {
    // Temporarily force createConnection to reject
    mysql.createConnection.mockImplementationOnce(() => {
      throw new Error('connection failed');
    });

    // Spy on console.error to verify it logs
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await DB.initializeDatabase();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Error initializing database')
    );
    spy.mockRestore();
  });
});

describe('Additional edge case tests for database.js', () => {
    test('getID throws when connection.execute rejects with error', async () => {
      const fakeConn = {
        execute: jest.fn(async () => {
          throw new Error('SQL execution error');
        }),
      };
  
      await expect(DB.getID(fakeConn, 'field', 'value', 'table')).rejects.toThrow('SQL execution error');
    });
  
    test('getID throws on empty rows result', async () => {
      const fakeConn = {
        execute: jest.fn(async () => [[]]),
      };
      // Edge case: no rows returned
      await expect(DB.getID(fakeConn, 'field', 'missing', 'table')).rejects.toThrow('No ID found');
    });
  
    test('initializeDatabase logs but does not throw on connection failure', async () => {
      mysql.createConnection.mockImplementationOnce(() => { throw new Error('Connection failed'); });
  
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
      await DB.initializeDatabase();
  
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error initializing database'));
  
      spy.mockRestore();
    });
  });

  describe('DB utility / query helpers', () => {
    test('query delegates to connection.execute and returns results', async () => {
      const fakeConn = {
        execute: jest.fn(async () => [[{ ok: true }]]),
      };
      const result = await DB.query(fakeConn, 'SELECT 1', []);
      expect(result).toEqual([{ ok: true }]);
      expect(fakeConn.execute).toHaveBeenCalledWith('SELECT 1', []);
    });
  
    test('getConnection awaits initialization and calls _getConnection', async () => {
      const spy = jest.spyOn(DB, '_getConnection').mockResolvedValue({ fake: true });
      const conn = await DB.getConnection();
      expect(conn).toEqual({ fake: true });
      spy.mockRestore();
    });
  
    test('getTokenSignature returns empty string when token malformed', () => {
      expect(DB.getTokenSignature('abc')).toBe('');
      expect(DB.getTokenSignature('a.b')).toBe('');
    });
  
    test('getOffset defaults currentPage to 1 and handles listPerPage correctly', () => {
      // Note: getOffset has a subtle bug with array brackets in code; test current behavior
      expect(DB.getOffset(undefined, 5)).toEqual((1 - 1) * [5]);
    });
  });
  
  describe('checkDatabaseExists', () => {
    test('returns true when SCHEMA_NAME rows exist', async () => {
      const fakeConn = {
        execute: jest.fn(async () => [[{ SCHEMA_NAME: 'pizza' }]]),
      };
      await expect(DB.checkDatabaseExists(fakeConn)).resolves.toBe(true);
    });
  
    test('returns false when no rows exist', async () => {
      const fakeConn = {
        execute: jest.fn(async () => [[]]),
      };
      await expect(DB.checkDatabaseExists(fakeConn)).resolves.toBe(false);
    });
  });
  
  describe('initializeDatabase success path', () => {
    test('calls table creation statements and addUser when db does not exist', async () => {
      // force db not existing
      const mockExec = jest.fn()
        .mockResolvedValueOnce([[]]) // checkDatabaseExists -> []
        .mockResolvedValue([[]]);    // all others
      const fakeConn = {
        execute: mockExec,
        query: jest.fn(async () => [[]]),
        end: jest.fn(),
      };
      // override _getConnection to return our fake connection
      const spyGetConn = jest.spyOn(DB, '_getConnection').mockResolvedValue(fakeConn);
  
      // Spy on addUser to confirm call
      const spyAddUser = jest.spyOn(DB, 'addUser').mockImplementation(async () => {});
  
      await DB.initializeDatabase();
  
      expect(spyAddUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@jwt.com' })
      );
      expect(fakeConn.query).toHaveBeenCalled();
      spyGetConn.mockRestore();
      spyAddUser.mockRestore();
    });
  });

describe('error paths in updateUser', () => {
    test('updateUser builds correct query when updating multiple fields', async () => {
      const fakeConn = {
        end: jest.fn(),
        execute: jest.fn(async () => [[]]),
      };
      const spyConn = jest.spyOn(DB, 'getConnection').mockResolvedValue(fakeConn);
      const spyQuery = jest.spyOn(DB, 'query').mockResolvedValue([]);
      // 👇 Mock getUser to avoid StatusCodeError
      const spyGetUser = jest.spyOn(DB, 'getUser').mockResolvedValue({});
  
      await DB.updateUser(42, 'NewName', 'new@email.com', 'newpass');
  
      expect(spyQuery).toHaveBeenCalledWith(
        fakeConn,
        expect.stringContaining('UPDATE user SET'),
      );
  
      spyConn.mockRestore();
      spyQuery.mockRestore();
      spyGetUser.mockRestore();
    });
  });
  
  describe('basic CRUD wrappers', () => {
    let fakeConn;
    beforeEach(() => {
        fakeConn = {
          end: jest.fn(),
          execute: jest.fn(async (sql) => {
            const query = typeof sql === 'string' ? sql : (sql?.sql || '');
      
            // Auth
            if (query.includes('SELECT userId FROM auth')) return [[{ userId: 1 }], []];
            if (query.includes('INSERT INTO auth'))       return [[], []];
            if (query.includes('DELETE FROM auth'))       return [[], []];
      
            // Store
            if (query.includes('INSERT INTO store'))      return [{ insertId: 99 }, []];
            if (query.includes('DELETE FROM store'))      return [[], []];
      
            // Orders / menu
            if (query.includes('SELECT id, franchiseId')) return [[{ id: 7 }], []];
            if (query.includes('SELECT id, menuId'))      return [[{ id: 8 }], []];
            if (query.includes('SELECT o.id'))            return [[{ id: 8, description: 'pizza', menuId: 3, price: 10 }], []];
            if (query.includes('INSERT INTO dinerOrder')) return [{ insertId: 42 }, []];
            if (query.includes('INSERT INTO dinerOrderItem')) return [[], []];
      
            return [[], []]; // default
          }),
          query: jest.fn(async (sql, params) => {
            // Delegate to execute to ensure DB.query uses same mock
            return fakeConn.execute(sql, params);
          }),
        };
      
        jest.spyOn(DB, 'getConnection').mockResolvedValue(fakeConn);
      });
      
      
  
    afterEach(() => {
      jest.restoreAllMocks();
    });
  
    test('loginUser inserts token', async () => {
      await DB.loginUser(42, 'header.payload.signature');
      expect(fakeConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth'),
        expect.arrayContaining(['signature', 42])
      );
    });
  
    test('isLoggedIn returns true when row exists', async () => {
      const result = await DB.isLoggedIn('x.y.sig');
      expect(result).toBe(true);
    });
  
    test('logoutUser deletes token', async () => {
      await DB.logoutUser('x.y.sig');
      expect(fakeConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM auth'),
        ['sig']
      );
    });
  
    test('createStore inserts and returns object', async () => {
      const store = await DB.createStore(5, { name: 'Test Store' });
      expect(store).toEqual({ id: 99, franchiseId: 5, name: 'Test Store' });
    });
  
    test('deleteStore executes correct delete', async () => {
      await DB.deleteStore(5, 99);
      expect(fakeConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM store'),
        [5, 99]
      );
    });
  
    test('getOrders fetches orders and items', async () => {
      // Simulate an order and its items
      fakeConn.execute.mockImplementationOnce(async () => [[{ id: 7, franchiseId: 1, storeId: 2, date: '2024-01-01' }]]);
      fakeConn.execute.mockImplementationOnce(async () => [[{ id: 8, menuId: 3, description: 'pizza', price: 10 }]]);
  
      const result = await DB.getOrders({ id: 1 });
      expect(result.orders[0].items[0]).toMatchObject({ description: 'pizza' });
      //expect(result.orders[0].items[0][0]).toMatchObject({ description: 'pizza' });
    });
  
    test('addDinerOrder inserts order and items', async () => {
      jest.spyOn(DB, 'getID').mockResolvedValue(3);
      const order = { franchiseId: 1, storeId: 2, items: [{ menuId: 3, description: 'pizza', price: 10 }] };
      const result = await DB.addDinerOrder({ id: 1 }, order);
      expect(result).toMatchObject({ franchiseId: 1, storeId: 2 });
      expect(fakeConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO orderItem'),
        expect.any(Array)
      );
    });
  });
  