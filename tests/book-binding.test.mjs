import test from 'node:test';
import assert from 'node:assert/strict';
import { bindingPoint, bindingRadius, BINDING_HINGE } from '../src/book-binding-math.js';
import { coverPose } from '../src/book-cover-math.js';
import { springStep } from '../src/page-curl-math.js';

test('the hardcover settles with more weight than paper, without overshoot at 30 or 60 fps', () => {
  for (const fps of [30,60]) for (const target of [0,1]) {
    let caseState={position:.5,velocity:0}, leaf={...caseState};
    for (let frame=0; frame<fps; frame++) {
      const previous=caseState.position;
      caseState=springStep(caseState.position,caseState.velocity,target,1/fps,true);
      leaf=springStep(leaf.position,leaf.velocity,target,1/fps);
      assert.ok(caseState.position>=0 && caseState.position<=1);
      assert.ok(Math.abs(caseState.position-target)<=Math.abs(previous-target));
      if(frame===5) assert.ok(Math.abs(caseState.position-target)>Math.abs(leaf.position-target));
    }
    assert.ok(Math.abs(caseState.position-target)<.001);
  }
});

test('the curved case wrapper remains attached to both actual boards through the full cover gesture', () => {
  for (const [anchorX,anchorZ] of [[.014,-.009],[.012,.030]]) {
    const radius = bindingRadius(anchorX,anchorZ);
    for (let step=0;step<=100;step++) {
      const pose=coverPose(step/100);
      const right=bindingPoint(0,pose.angle,radius,anchorX,anchorZ);
      const left=bindingPoint(1,pose.angle,radius,anchorX,anchorZ);
      assert.ok(Math.hypot(right.x-anchorX,right.z-anchorZ)<1e-10);
      const x=-anchorX*Math.cos(pose.angle)+(anchorZ-BINDING_HINGE)*Math.sin(pose.angle);
      const z=anchorX*Math.sin(pose.angle)+(anchorZ-BINDING_HINGE)*Math.cos(pose.angle)+BINDING_HINGE;
      assert.ok(Math.hypot(left.x-x,left.z-z)<1e-10);
      for (const u of [.2,.5,.8]) {
        const point=bindingPoint(u,pose.angle,radius,anchorX,anchorZ);
        assert.ok(Math.abs(bindingRadius(point.x,point.z)-radius)<1e-10);
      }
    }
  }
});

test('closed spine has a rounded continuous depth, not a static strip under separated boards', () => {
  const radius=bindingRadius(.014,-.009);
  const points=Array.from({length:65},(_,i)=>bindingPoint(i/64,Math.PI,radius));
  assert.ok(Math.min(...points.map(p=>p.x)) < -.05);
  assert.ok(Math.max(...points.map(p=>p.z)) > .092);
  assert.ok(Math.min(...points.map(p=>p.z)) < -.008);
  const held=bindingPoint(.4,coverPose(.5).angle,radius);
  for(let i=0;i<120;i++) assert.deepEqual(bindingPoint(.4,coverPose(.5).angle,radius),held);
});
