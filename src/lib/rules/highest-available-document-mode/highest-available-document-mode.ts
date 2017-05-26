/**
 * @fileoverview Check if browsers that support document modes are
 * informed to use the highest on available.
 */

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

import * as url from 'url';

import { IAsyncHTMLDocument, IElementFoundEvent, IRule, IRuleBuilder, ITraverseEndEvent } from '../../types'; // eslint-disable-line no-unused-vars
import { RuleContext } from '../../rule-context'; // eslint-disable-line no-unused-vars

// ------------------------------------------------------------------------------
// Public
// ------------------------------------------------------------------------------

const rule: IRuleBuilder = {
    create(context: RuleContext): IRule {

        let requireMetaTag = false;
        let suggestRemoval = false;

        // This function exists because not all collector (e.g.: jsdom)
        // support matching attribute values case-insensitively.
        //
        // https://www.w3.org/TR/selectors4/#attribute-case

        const getXUACompatibleMetaTags = (elements) => {
            return elements.filter((element) => {
                return (element.getAttribute('http-equiv') !== null &&
                        element.getAttribute('http-equiv').toLowerCase() === 'x-ua-compatible');
            });
        };

        const checkHeader = async (resource: string, responseHeaders: object) => {
            const headerValue = responseHeaders['x-ua-compatible'];

            if (typeof headerValue === 'undefined') {

                // There is no need to require the HTTP header if:
                //
                //  * the user required the meta tag to be specified.
                //  * the targeted browsers don't include the ones that
                //    support document modes

                if (!requireMetaTag && !suggestRemoval) {
                    await context.report(resource, null, `Response does not include the 'X-UA-Compatible' header`);
                }

                return;
            }

            // If the HTTP response header is included, but the targeted
            // browsers don't include the browser that support document
            // modes, suggest not sending the header.

            if (suggestRemoval) {
                await context.report(resource, null, `'X-UA-Compatible' HTTP response header is not needed`);

                return;
            }

            if (headerValue.toLowerCase() !== 'ie=edge') {
                await context.report(resource, null, `The value of the 'X-UA-Compatible' HTTP response header should be 'ie=edge'`);
            }

            // Note: The check if the X-UA-Compatible HTTP response
            //       header is sent for non-HTML documents is covered
            //       by the `no-html-only-headers` rule.

        };

        const checkMetaTag = async (resource: string) => {

            const pageDOM = <IAsyncHTMLDocument>context.pageDOM;
            const XUACompatibleMetaTags = getXUACompatibleMetaTags(await pageDOM.querySelectorAll('meta'));

            // By default, if the user did not request the meta tag to
            // be specified, prefer the HTTP response header over using
            // the meta tag, as the meta tag will not always work.

            if (!requireMetaTag || suggestRemoval) {
                if (XUACompatibleMetaTags.length !== 0) {
                    for (const metaTag of XUACompatibleMetaTags) {
                        await context.report(resource, metaTag, `Meta tag is not needed`);
                    }
                }

                return;
            }

            // If the user requested the meta tag to be specified.

            if (XUACompatibleMetaTags.length === 0) {
                await context.report(resource, null, `No 'X-UA-Compatible' meta tag was specified`);

                return;
            }

            // Treat the first X-UA-Compatible meta tag as the one
            // the user intended to use, and check if:

            const XUACompatibleMetaTag = XUACompatibleMetaTags[0];
            const contentValue = (XUACompatibleMetaTag.getAttribute('content') || '').toLowerCase();

            // * it has the value `ie=edge`.

            if (contentValue !== 'ie=edge') {
                await context.report(resource, XUACompatibleMetaTag, `The value of 'content' should be 'ie=edge'`);
            }

            // * it's specified in the `<head>` before all other
            //   tags except for the `<title>` and other `<meta>` tags.
            //
            //   https://msdn.microsoft.com/en-us/library/jj676915.aspx

            const headElements = await pageDOM.querySelectorAll('head *');
            let metaTagIsBeforeRequiredElements = true;

            for (const headElement of headElements) {
                if (headElement.isSame(XUACompatibleMetaTag)) {
                    if (!metaTagIsBeforeRequiredElements) {
                        await context.report(resource, XUACompatibleMetaTag, `Meta tag needs to be included before all other tags except for the '<title>' and the other '<meta>' tags`);
                    }

                    break;
                }

                if (!['title', 'meta'].includes(headElement.nodeName.toLowerCase())) {
                    metaTagIsBeforeRequiredElements = false;
                }
            }

            // * it's specified in the `<body>`.

            const bodyMetaTags = getXUACompatibleMetaTags(await pageDOM.querySelectorAll('body meta'));

            if ((bodyMetaTags.length > 0) && bodyMetaTags[0].isSame(XUACompatibleMetaTag)) {
                await context.report(resource, XUACompatibleMetaTag, `Meta tag should not be specified in the '<body>'`);

                return;
            }

            // All other meta tags should not be included.

            if (XUACompatibleMetaTags.length > 1) {
                const metaTags = XUACompatibleMetaTags.slice(1);

                for (const metaTag of metaTags) {
                    await context.report(resource, metaTag, `A 'X-UA-Compatible' meta tag was already specified`);
                }
            }
        };

        const loadRuleConfigs = () => {
            requireMetaTag = (context.ruleOptions && context.ruleOptions.requireMetaTag) || false;

            // Document modes are only supported by Internet Explorer 8/9/10.
            // https://msdn.microsoft.com/en-us/library/jj676915.aspx

            suggestRemoval = ['ie 8', 'ie 9', 'ie 10'].some((e) => {
                return context.targetedBrowsers.includes(e);
            });
        };

        const validate = async (event: ITraverseEndEvent) => {
            const { resource } = event;

            // The following check don't make sense for local files.

            if (url.parse(resource).protocol !== 'file:') {
                checkHeader(resource, context.pageHeaders);
            }

            await checkMetaTag(resource);
        };

        loadRuleConfigs();

        return { 'traverse::end': validate };
    },
    meta: {
        docs: {
            category: 'interoperability',
            description: 'Use highest available document mode'
        },
        fixable: 'code',
        recommended: true,
        schema: [{
            additionalProperties: false,
            properties: { requireMetaTag: { type: 'boolean' } },
            type: ['object', null]
        }],
        worksWithLocalFiles: true
    }
};

export default rule;
