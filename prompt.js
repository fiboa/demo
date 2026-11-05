export default {
  prompt: `Make the landing page of this demo site a grid of tiles: one per demo, with a picture (one of the demo's example pictures, or a screenshot) and the current text below it. Add a tile for the map at https://fiboa.org/map/. Then add a link to the demos on https://fiboa.org, in the header and on the home page.`,
  conversation: [
    {
      you: 'fiboa.org needs a link to the demos. Can you make the demo index nicer, with a tile and a picture per demo? You already have pictures for every demo; pick one. Also add a tile for the map at fiboa.org/map.',
      claude: 'Picked a picture per demo, took a screenshot where none fitted, and added the links to the fiboa.org site.',
    },
    { you: 'Yes, commit and push the demos to main. The fiboa.org site may be pushed to main too.' },
  ],
  tips: [
    'Every demo on this site has its own "Built with a prompt" button: open one to see how that page came about.',
  ],
};
