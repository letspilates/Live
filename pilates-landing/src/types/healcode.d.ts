import 'react';

/**
 * JSX typing for the Mindbody (Healcode) schedule widget custom element.
 * The element is upgraded by https://widgets.mindbodyonline.com/javascripts/healcode.js
 */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'healcode-widget': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        'data-type'?: string;
        'data-widget-partner'?: string;
        'data-widget-id'?: string;
        'data-widget-version'?: string;
      };
    }
  }
}
