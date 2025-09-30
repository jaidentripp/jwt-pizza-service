/* eslint-env jest */
const bcrypt = require('bcrypt');

// mock db
jest.mock('mysql2/promise', () => {
  return {
    createConnection: jest.fn(async () => {
      return {
        execute: jest.fn(async (sql, params) => {
          // Simulate SELECT id query success/failure
          if (sql.startsWith('SELECT id FROM menu')) {
            return [[{ id: 1 }]];
          }
          if (sql.includes('INFORMATION_SCHEMA')) {
            return [[{ SCHEMA_NAME: 'pizza' }]];
          }
          // default empty result
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
