#python3

import random
import time


# Networking

class Message:
    def __init__(self, src, dst, content):
        self.src = src
        self.dst = dst
        self.content = content

    def __repr__(self):
        return f"{self.src} -> {self.dst} '{self.content}'"


class Peer:
    def __init__(self, id, network):
        self.id = id
        self.network = network

    def __repr__(self):
        return f"u/{str(self.id)}"

    def send(self, dst, content):
        self.network.push(Message(src=self, dst=dst, content=content))

    def onMessage(self, message):
        assert(message.dst == self)
        print(f"[{self}] received from {message.src}: {message.content}")


class Network:
    def __init__(self):
        self.pending = []

    def push(self, message):
        self.pending.append(message)

    def deliverOne(self):
        if len(self.pending) > 0:
            msg = self.pending.pop(random.randrange(len(self.pending)))
            msg.dst.onMessage(msg)

    def deliverAll(self):
        count = len(self.pending)
        while count > 0:
            self.deliverOne()
            count -= 1

    def deliverForever(self):
        while len(self.pending) > 0:
            self.deliverOne()


# Smart peer

class TimedMessage:
    def __init__(self, clock, content):
        self.clock = clock
        self.content = content

    def __repr__(self):
        return f"{self.clock} '{self.content}'"


class SmartPeer(Peer):
    def __init__(self, id, network):
        super().__init__(id, network)
        self.clock = 0
    
    def send(self, dst, content):
        self.clock += 1
        super().send(dst, TimedMessage(clock=self.clock, content=content))

    def onMessage(self, message):
        super().onMessage(message)
        if self.clock + 1 < message.content.clock:
            print(f"[{self}] there was {message.content.clock - self.clock - 1} news lost !")
        self.clock = max(message.content.clock, self.clock)
        self.send(message.src, "hi too !")



net = Network()
peers = [SmartPeer(x, net) for x in ["A", "B", "C", "D", "E", "F", "G"]]
[peers[0].send(x, "hi!") for x in peers]

net.deliverOne()
while True:
    net.deliverAll()
    time.sleep(1)