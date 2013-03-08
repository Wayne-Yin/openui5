package com.sap.selenium.action;

import java.awt.Robot;

import org.openqa.selenium.Dimension;
import org.openqa.selenium.Point;
import org.openqa.selenium.WebDriver;



public interface IUserAction{

	public void setRtl(boolean rtl);
	public boolean getRtl();
	
	
	public boolean enableBrowserFullScreen(WebDriver driver);
	public Robot getRobot();
	public void moveMouseToStartPoint(WebDriver driver);
	
	public void mouseMove(Point location);
	public void mouseMove(WebDriver driver, String elementId);
	
	public void mouseClick(Point location);
	public void mouseClick(WebDriver driver, String elementId);
	
	public void mouseClickAndHold(Point location);
	public void mouseClickAndHold(WebDriver driver, String elementId);
	
	public void mouseRelease();
	
	public void mouseOver(WebDriver driver, String elementId, int durationMillisecond);


	public void pressOneKey(int keycode);
	public void pressTwoKeys(int firstKeyCode, int secondKeyCode);
	
    public Dimension getElementDimension(WebDriver driver, String elementId);
    public Point getElementLocation(WebDriver driver, String elementId);
    public Point getBrowserViewBoxLocation(WebDriver driver);

}
