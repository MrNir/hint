/**
 * @fileoverview Minimum event functionality a connector must implement
 * in order to be valid.
 */

/* eslint-disable no-sync */

import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

import groupBy = require('lodash/groupBy');
import every = require('lodash/every');
import * as sinon from 'sinon';
import anyTest, { TestInterface } from 'ava';
import { Server } from '@hint/utils-create-server';
import { IConnector, Events } from 'hint/dist/src/lib/types';
import { Engine } from 'hint';

import ChromeConnector from '../src/connector';

type EventsContext = {
    connector?: IConnector;
    engine: Engine<Events>;
    engineEmitSpy: sinon.SinonSpy<any, any>;
    engineEmitAsyncSpy: sinon.SinonSpy<any, any>;
};

const test = anyTest as TestInterface<EventsContext>;

const name: string = 'chrome';

/* eslint-disable sort-keys */
/** The minimum set of events the connectors need to implement. */
const events = [
    ['scan::start', { resource: 'http://localhost/' }],
    ['fetch::start::target', { resource: 'http://localhost/' }],
    ['fetch::end::html', {
        resource: 'http://localhost/',
        request: { url: 'http://localhost/' },
        response: {
            body: {
                content: fs.readFileSync(path.join(__dirname, './fixtures/common/index.html'), 'utf8'),
                rawContent: null,
                rawResponse: null
            },
            charset: 'utf-8',
            hops: [],
            mediaType: 'text/html',
            statusCode: 200,
            url: 'http://localhost/'
        }
    }],
    /*
     * TODO: need to know how many traverse::XX we need and how to be consistent among connectors
     * ['traverse::down', 'http://localhost/'],
     * ['traverse::up', 'http://localhost/'],
     */
    ['element::html', { resource: 'http://localhost/' }],
    ['traverse::start', { resource: 'http://localhost/' }],
    ['element::head', { resource: 'http://localhost/' }],
    ['element::title', { resource: 'http://localhost/' }],
    ['element::script', { resource: 'http://localhost/' }],
    ['element::script', { resource: 'http://localhost/' }],
    ['element::style', { resource: 'http://localhost/' }],
    ['element::body', { resource: 'http://localhost/' }],
    ['element::h1', { resource: 'http://localhost/' }],
    ['element::p', { resource: 'http://localhost/' }],
    ['traverse::end', { resource: 'http://localhost/' }],
    ['fetch::start', { resource: 'http://localhost/script3.js' }],
    ['fetch::end::script', {
        element: {
            getAttribute(attr: string) {
                if (attr === 'src') {
                    return '/script3.js';
                }

                return '';
            }
        },
        resource: 'http://localhost/script.js',
        request: { url: 'http://localhost/script3.js' },
        response: {
            body: {
                content: '',
                rawContent: null,
                rawResponse: null
            },
            charset: 'utf-8',
            hops: ['http://localhost/script3.js',
                'http://localhost/script2.js'],
            mediaType: 'text/javascript',
            statusCode: 200,
            url: 'http://localhost/script.js'
        }
    }],
    ['fetch::start', { resource: 'http://localhost/style.css' }],
    ['fetch::end::css', {
        element: {
            getAttribute(attr: string) {
                if (attr === 'href') {
                    return 'style.css';
                }

                return '';
            }
        },
        resource: 'http://localhost/style.css',
        request: { url: 'http://localhost/style.css' },
        response: {
            body: {
                content: '',
                rawContent: null,
                rawResponse: null
            },
            charset: 'utf-8',
            hops: [],
            mediaType: 'text/css',
            statusCode: 200,
            url: 'http://localhost/style.css'
        }
    }],
    ['fetch::start', { resource: 'http://localhost/script4.js' }],
    ['fetch::end::script', {
        element: {
            getAttribute(attr: string) {
                if (attr === 'href') {
                    return '/script4.js';
                }

                return '';
            }
        },
        resource: 'http://localhost/script4.js',
        request: { url: 'http://localhost/script4.js' },
        response: {
            charset: 'utf-8',
            mediaType: 'text/javascript',
            statusCode: 404,
            url: 'http://localhost/script4.js'
        }
    }],
    ['fetch::error', {
        element: {
            getAttribute(attr: string) {
                if (attr === 'href') {
                    return '/script5.js';
                }

                return '';
            }
        },
        resource: 'test://fa.il',
        hops: ['http://localhost/script5.js']
    }],
    ['scan::end', { resource: 'http://localhost/' }]
];
/* eslint-enable sort-keys */

/**
 * Losely compares to data events. It will check if all the properties in
 * `data2` are in `data1` with the same values.
 */
const sameData = (actual: any, expected: any): boolean => {
    const actualType = typeof actual;
    const expectedType = typeof expected;

    // If `expected` doesn't have a value, then it is an enhacement and we can ignore it
    if (actualType !== 'undefined' && expectedType === 'undefined') {
        return true;
    }

    // We test here getAttribute.
    if (expectedType === 'function' && actualType === 'function') {
        return ['src', 'href'].some((attribute) => {
            return actual(attribute) === expected(attribute);
        });
    }

    if (expectedType !== 'object' || actual === null) {
        return actual === expected;
    }

    return every(expected, (value, key) => {
        return sameData(actual[key], value);
    });
};

const validEvent = (eventsToSearch: any[], expectedEvent: any) => {
    const originalSize = eventsToSearch.length;

    for (let i = 0; i < eventsToSearch.length; i++) {
        const emittedEvent = eventsToSearch[i];

        if (sameData(emittedEvent, expectedEvent)) {
            eventsToSearch.splice(i, 1);

            break;
        }
    }

    return originalSize !== eventsToSearch.length;
};

test.beforeEach((t) => {
    const engine: Engine<Events> = {
        emit(): boolean {
            return false;
        },
        async emitAsync(): Promise<any> { },
        on(): Engine {
            return null as any;
        }
    } as any;

    t.context.engineEmitAsyncSpy = sinon.spy(engine, 'emitAsync');
    t.context.engineEmitSpy = sinon.spy(engine, 'emit');

    t.context.engine = engine;
});

test.afterEach.always(async (t) => {
    t.context.engineEmitAsyncSpy.restore();
    t.context.engineEmitSpy.restore();
    await t.context.connector!.close();
});

test(`[${name}] Events`, async (t) => {
    const { engine } = t.context;
    const connector: IConnector = new ChromeConnector(engine, {});

    t.context.connector = connector;

    const server = await Server.create({
        configuration: {
            '/': fs.readFileSync(path.join(__dirname, './fixtures/common/index.html'), 'utf-8'),
            '/nellie.png': { content: fs.readFileSync(path.join(__dirname, './fixtures/common/nellie.png')) },
            '/script.js': { content: '' },
            '/script2.js': {
                content: 'script.js',
                status: 302
            },
            '/script3.js': {
                content: 'script2.js',
                status: 302
            },
            '/script4.js': {
                content: 'script4.js',
                status: 404
            },
            '/script5.js': null,
            '/style.css': { content: '' }
        }
    });

    const pendingEvents: any[] = events.map((event) => {
        return Server.updateLocalhost(event, server.port);
    });

    await connector.collect(new URL(`http://localhost:${server.port}/`));

    const { engineEmitSpy, engineEmitAsyncSpy } = t.context;
    const invokes: any[] = [];

    for (let i = 0; i < engineEmitAsyncSpy.callCount; i++) {
        invokes.push(engineEmitAsyncSpy.getCall(i).args);
    }

    for (let i = 0; i < engineEmitSpy.callCount; i++) {
        invokes.push(engineEmitSpy.getCall(i).args);
    }

    // List of events that only have to be called once per execution
    const singles = ['scan::start', 'scan::end', 'fetch::end::html'];
    const groupedEvents = groupBy(invokes, (invoke) => {
        return invoke[0];
    });

    singles.forEach((single) => {
        t.is(groupedEvents[single] && groupedEvents[single].length, 1, `${single} should be called once`);
    });

    pendingEvents.forEach((event) => {
        t.true(validEvent(invokes, event), `Event ${event[0]}/${event[1].resource} has the same properties`);
    });

    await Promise.all([connector.close(), server.stop()]);
});
