/** Remove reasoning tags before content reaches the visible chat bubble. */
export const stripThinkMarkup = (text: string = '') => text
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/gi, '')
  // Some providers omit the closing tag or HTML-escape only one side.
  .replace(/<\/?think>/gi, '')
  .replace(/&lt;\/?think&gt;/gi, '')
