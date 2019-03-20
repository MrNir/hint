/**
 * @fileoverview The codeframe formatter creates a report with errors, warnings,
 * and the code with a pointer where the problem was found (if applicable).
 *
 * This formatter is based on [eslint's codeframe formatter](https://github.com/eslint/eslint/blob/master/lib/formatters/codeframe.js)
 */

/*
 * ------------------------------------------------------------------------------
 * Requirements
 * ------------------------------------------------------------------------------
 */

import chalk from 'chalk';
import {
    groupBy,
    reduce,
    sortBy
} from 'lodash';
import * as logSymbols from 'log-symbols';
const stripAnsi = require('strip-ansi');

import cutString from 'hint/dist/src/lib/utils/misc/cut-string';
import { debug as d } from 'hint/dist/src/lib/utils/debug';
import { IFormatter, Problem, ProblemLocation, Severity, FormatterOptions } from 'hint/dist/src/lib/types';
import * as logger from 'hint/dist/src/lib/utils/logging';
import writeFileAsync from 'hint/dist/src/lib/utils/fs/write-file-async';

const _ = {
    groupBy,
    reduce,
    sortBy
};
const debug = d(__filename);


const countLeftWhiteSpaces = (txt: string): number => {
    const match = txt.match(/(\s+)/);

    if (!match) {
        return 0;
    }

    return match[0].length;
};

const safeTrim = (txt: string, charsToRemove: number): boolean => {
    return (/^\s+$/).test(txt.substr(0, charsToRemove));
};

const codeFrame = (code: string, location: ProblemLocation): string => {
    /* istanbul ignore next */
    const line: number = typeof location.elementLine === 'number' ? location.elementLine : -1;
    /* istanbul ignore next */
    const column: number = typeof location.elementColumn === 'number' ? location.elementColumn : -1;
    const codeInLines: string[] = `\n${code}`.split('\n');
    const whiteSpacesToRemove: number = countLeftWhiteSpaces(codeInLines[codeInLines.length - 1]);
    const offsetColumn: number = location.column;
    const extraLinesToShow: number = 2;
    const firstLine: number = line - extraLinesToShow > 0 ? line - extraLinesToShow : 0;
    const lastLine: number = line + (extraLinesToShow + 1) < codeInLines.length ? line + (extraLinesToShow + 1) : codeInLines.length;
    let result = '';

    if (firstLine !== 0) {
        result += '…\n';
    }

    for (let i: number = firstLine; i < lastLine; i++) {
        let partialResult = '';
        let mark = '';
        const canTrim: boolean = safeTrim(codeInLines[i], whiteSpacesToRemove);

        if (i === 1 || !canTrim) {
            partialResult = codeInLines[i];
        } else {
            // The first line doesn't have spaces but the other elements keep the original format
            partialResult = codeInLines[i].substr(whiteSpacesToRemove);
        }

        if (i === line) {
            let markPosition: number = column;

            if (canTrim) {
                markPosition -= whiteSpacesToRemove;
            }

            if (line !== 1 && canTrim) {
                markPosition += offsetColumn;
            }


            if (markPosition < 0) {
                markPosition = 0;
            }

            const cutPosition: number = line !== 1 ? markPosition : column;

            if (cutPosition > 50) {
                markPosition = 50 + 3;
                partialResult = `… ${partialResult.substr(column - 50)}`;
            }

            if (partialResult.length > cutPosition + 50) {
                partialResult = `${partialResult.substr(0, cutPosition + 50)} …`;
            }

            mark = `${new Array(markPosition).join(' ')}^`;
        }

        result += `${partialResult}\n`;

        if (mark) {
            result += `${mark}\n`;
        }
    }

    if (lastLine !== codeInLines.length) {
        result += '…\n';
    }

    return result;
};

/*
 * ------------------------------------------------------------------------------
 * Formatter
 * ------------------------------------------------------------------------------
 */

export default class CodeframeFormatter implements IFormatter {
    /**
     * Format the problems grouped by `resource` name and sorted by line and column number,
     *  indicating where in the element there is an error.
     */
    public async format(messages: Problem[], options: FormatterOptions = {}) {
        debug('Formatting results');

        if (messages.length === 0) {
            return;
        }

        const resources: _.Dictionary<Problem[]> = _.groupBy(messages, 'resource');
        let totalErrors: number = 0;
        let totalWarnings: number = 0;

        let result = _.reduce(resources, (total: string, msgs: Problem[], resource: string) => {
            const sortedMessages: Problem[] = _.sortBy(msgs, ['location.line', 'location.column']);
            const resourceString = chalk.cyan(`${cutString(resource, 80)}`);

            const partialResult = _.reduce(sortedMessages, (subtotal: string, msg: Problem) => {
                let partial: string;
                const severity = Severity.error === msg.severity ? chalk.red('Error') : chalk.yellow('Warning');
                const location = msg.location;

                if (Severity.error === msg.severity) {
                    totalErrors++;
                } else {
                    totalWarnings++;
                }

                partial = `${severity}: ${msg.message} (${msg.hintId}) at ${resourceString}${msg.sourceCode ? `:${location.line}:${location.column}` : ''}\n`;

                if (msg.sourceCode) {
                    partial += codeFrame(msg.sourceCode, location);
                }

                partial += '\n';

                return subtotal + partial;
            }, '');

            return total + partialResult;
        }, '');

        const color: typeof chalk = totalErrors > 0 ? chalk.red : chalk.yellow;

        result += color.bold(`${logSymbols.error} Found a total of ${totalErrors} ${totalErrors === 1 ? 'error' : 'errors'} and ${totalWarnings} ${totalWarnings === 1 ? 'warning' : 'warnings'}`);

        if (!options.output) {
            logger.log(result);

            return;
        }

        await writeFileAsync(options.output, stripAnsi(result));
    }
}
