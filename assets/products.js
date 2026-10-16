import { NPCS } from './npcs.js';

// Products are independent of people. A customer can receive any offer on a later day.
const talkingPoints = {
  "mildred": [
    "Explain what happens when a toaster breaks.",
    "Explain repair or replacement limits."
  ],
  "doug": [
    "Describe how the lawn system detects trouble.",
    "Explain how the customer can test the system."
  ],
  "kevin": [
    "Explain how the upgrade changes the customer's chair.",
    "Explain setup and refund support."
  ],
  "priya": [
    "Explain the benefits beyond ordinary drinking water.",
    "Offer evidence or a trial."
  ],
  "frank": [
    "Explain how sunlight delivery helps plants.",
    "Explain what happens during cloudy weather."
  ],
  "gloria": [
    "Explain how and when the applause arrives.",
    "Offer a live demonstration."
  ],
  "marty": [
    "Explain how the leaf relocation system works.",
    "Explain any cleanup or return guarantee."
  ],
  "ada": [
    "Explain how the smart laces work.",
    "Explain replacements and support."
  ],
  "vince": [
    "Explain how polishing affects a mirror.",
    "Explain how the finish will be protected."
  ],
  "celia": [
    "Explain how quickly confetti arrives.",
    "Explain late-delivery refunds."
  ],
  "omar": [
    "Explain charging and battery life at night.",
    "Demonstrate how long it lasts."
  ],
  "bea": [
    "Explain what protection the mist provides.",
    "Explain the coverage limits."
  ],
  "lester": [
    "Explain what the streaming service delivers.",
    "Demonstrate how silence differs from muting."
  ],
  "nia": [
    "Explain how the concierge moves pigeons away.",
    "Explain whether the birds stay safe."
  ],
  "sal": [
    "Explain how hot ice changes drinks.",
    "Offer a sample or a test."
  ],
  "rita": [
    "Explain how the fridge coach helps staff.",
    "Explain support for breakdowns."
  ],
  "desmond": [
    "Explain how this affects the odds of finding parking.",
    "Offer a fair way to test it."
  ],
  "jun": [
    "Explain how the umbrella protects a courier in rain.",
    "Explain how to check it works."
  ],
  "tara": [
    "Explain how reminders prevent overwatering.",
    "Explain how reliable its alerts are."
  ],
  "howard": [
    "Explain how the antenna improves Wi-Fi.",
    "Describe a measurable signal test."
  ],
  "ingrid": [
    "Explain how pager forecasts differ from phone weather.",
    "Explain forecast accuracy and support."
  ],
  "percy": [
    "Explain how mood lighting improves the microwave.",
    "Explain installation and electrical safety."
  ],
  "lana": [
    "Explain why bottled air is better than ordinary air.",
    "Offer a concrete comparison or trial."
  ],
  "max": [
    "Explain what the cat translator understands.",
    "Offer a demonstration with a cat."
  ],
  "evelyn": [
    "Explain how bingo players see the numbers.",
    "Explain backups if the system fails."
  ],
  "gwen": [
    "Explain how bananas stay fresh.",
    "Explain the spoilage guarantee."
  ],
  "hector": [
    "Explain what the robot does for plants.",
    "Offer a working demonstration."
  ],
  "sasha": [
    "Explain how the playlist helps customers sleep.",
    "Provide a trial and cancellation details."
  ],
  "raj": [
    "Explain how the system finds missing socks.",
    "Explain privacy and tracking accuracy."
  ],
  "tessa": [
    "Explain how the stickers change garage acoustics.",
    "Offer a noise-reduction test."
  ],
  "walter": [
    "Explain how the plan prevents stapler jams.",
    "Explain maintenance and replacements."
  ],
  "yasmin": [
    "Explain how fast the charger gets delivered.",
    "Explain refunds for missed delivery."
  ],
  "bruno": [
    "Explain what a verified handshake proves.",
    "Explain mistakes or false matches."
  ],
  "naomi": [
    "Explain how the bookmark waters a plant.",
    "Give a simple demonstration."
  ],
  "felix": [
    "Explain how the toaster plays ringtones.",
    "Explain installation and support."
  ]
};
export const PRODUCTS = NPCS.map(person => ({
  id:person.id, offer:person.offer, value:person.value,
  concerns:[
    { id:'cost', detail:'State the offered price, including any ongoing fees.' },
    { id:'usefulness', detail:talkingPoints[person.id][0] },
    { id:'credibility', detail:talkingPoints[person.id][1] },
  ],
}));
