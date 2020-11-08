# TODO

* [x] proto

* [ ] multiplayer
  * [ ] signaling server
  * [ ] p2p game system
    * [ ] party setup
    * [ ] game state evolution
  * [ ] hosting

* [ ] game
  * [ ] choose start position
  * [ ] better tile gen
  * [ ] more gameplay
    * [ ] modes coop / versus
    * [ ] bonus action tile

* [ ] DA
  * [ ] nom
  * [ ] lore / ui style
  * [ ] responsive UI
  * [ ] action animations

* [ ] other
  * [ ] PWA
  * [ ] error monitoring


# ARCHI

web views
* main
  * party setup
  * party
    * game board
    * user input
    * all players actions
  * after party
    * score
* sidebar
  * group setup
  * chat

js modules
* ui
  * game board manager
  * user inputs manager
  * all player actions manager
* game
* p2p